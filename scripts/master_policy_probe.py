"""Run the booked ONNX in a bounded worker without gateway credentials or a robot connection."""
from hashlib import sha256
import json
import os
from pathlib import Path
import sys


def bound_worker():
    # Set limits before loading the native execution engine or untrusted data.
    limit = 2 * 1024**3
    if os.name == 'nt':
        import win32api
        import win32job
        job = win32job.CreateJobObject(None, '')
        info = win32job.QueryInformationJobObject(job, win32job.JobObjectExtendedLimitInformation)
        info['BasicLimitInformation']['LimitFlags'] |= win32job.JOB_OBJECT_LIMIT_PROCESS_MEMORY
        info['ProcessMemoryLimit'] = limit
        win32job.SetInformationJobObject(job, win32job.JobObjectExtendedLimitInformation, info)
        win32job.AssignProcessToJobObject(job, win32api.GetCurrentProcess())
        return job
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (limit,limit))
    resource.setrlimit(resource.RLIMIT_CPU, (160,160))


def verify_scene(scene, profile):
    from xml.etree import ElementTree
    if not scene or not Path(scene).is_absolute():
        raise ValueError('Gateway requires the installed Master Ultra MuJoCo scene for new policies')
    scene = Path(scene)
    model = scene.with_name('x2.xml').read_bytes()
    expected = profile['simulation']
    if sha256(scene.read_bytes()).hexdigest() != expected['scene_sha256'] or sha256(model).hexdigest() != expected['x2_sha256']:
        raise ValueError('Gateway simulator differs from the native Master Ultra profile')
    mesh_set = sha256()
    for name in sorted({n.attrib['file'] for n in ElementTree.fromstring(model).iter('mesh') if 'file' in n.attrib}):
        mesh = scene.parents[1]/'meshes'/name
        mesh_set.update(name.encode()+b'\0'+sha256(mesh.read_bytes()).digest())
    if mesh_set.hexdigest() != expected['mesh_set_sha256']:
        raise ValueError('Master Ultra simulator mesh set changed')


class UltraSimulation:
    """Closed-loop replay a new policy on the vendor's floating-base Master Ultra scene."""
    def __init__(self, scene, names, parameters, velocity, effort):
        import numpy as np
        import mujoco as mj
        self.model = model = mj.MjModel.from_xml_path(str(scene))
        self.data = data = mj.MjData(model)
        joints = [model.joint(n).id for n in names]
        self.pos, self.vel = model.jnt_qposadr[joints], model.jnt_dofadr[joints]
        self.act = [model.actuator('motor_'+n).id for n in names]
        self.floor = model.geom('floor').id
        self.velocity, self.effort = velocity, effort
        self.defaults = parameters['default_joint_pos']
        self.kp,self.kd = parameters['joint_stiffness'],parameters['joint_damping']
        self.scale = parameters['action_scale']
        data.qpos[self.pos] = self.defaults
        mj.mj_forward(model, data)
        self.last = np.zeros(len(names))
        self.pelvis = model.body('pelvis').id
        self.feet = {model.body(side+'_ankle_roll_link').id for side in ('left','right')}
        self.substeps = round(.02/model.opt.timestep)
        if abs(self.substeps*model.opt.timestep-.02) > 1e-9:
            raise ValueError('Simulator control period does not match the native 50 Hz contract')

    def observation(self, q, v):
        import numpy as np
        d = self.data
        gravity = -d.xmat[self.pelvis].reshape(3,3)[2]
        return np.concatenate((q,v,gravity,d.qvel[3:6]*.25,d.qpos[self.pos]-self.defaults,
                               d.qvel[self.vel]*.05,self.last)).astype('float32').reshape(1,-1)

    def advance(self, action, lower, upper):
        import numpy as np
        import mujoco as mj
        target = self.defaults + self.scale*action
        if (target < lower).any() or (target > upper).any():
            raise ValueError('Simulated policy commanded a target outside native joint limits')
        model, d = self.model, self.data
        self.last = action
        for _ in range(self.substeps):
            d.ctrl[self.act] = self.kp*(target-d.qpos[self.pos])-self.kd*d.qvel[self.vel]
            mj.mj_step(model,d)
            if not np.isfinite(d.qpos).all() or (np.abs(d.qvel[self.vel]) > self.velocity).any():
                raise ValueError('Simulated motion exceeded native joint velocity limits')
            if ((d.qpos[self.pos] < lower).any() or (d.qpos[self.pos] > upper).any() or
                    (np.abs(d.actuator_force[self.act]) > self.effort).any()):
                raise ValueError('Simulated robot exceeded measured model position or effort limits')
            for contact in d.contact:
                if contact.dist >= 0: continue
                if self.floor in contact.geom:
                    other = contact.geom2 if contact.geom1 == self.floor else contact.geom1
                    if model.geom_bodyid[other] not in self.feet:
                        raise ValueError(f'Simulated {model.body(model.geom_bodyid[other]).name} contacted the floor at {d.time:.3f}s')
                elif contact.dist < -.001:
                    raise ValueError('Simulated robot self-collision')

    def terminal(self):
        import numpy as np
        upright = self.data.xmat[self.pelvis].reshape(3,3)[2,2]
        if upright < .90 or not np.any([self.floor in c.geom for c in self.data.contact]):
            raise ValueError('Simulated policy did not end in supported upright posture')


def evaluate(policy, expected, scene=None):
    import numpy as np
    import onnxruntime as ort
    profile = json.loads(Path(__file__).with_name('master-ultra-native-profile.json').read_text())
    digest = sha256(policy).hexdigest()
    if expected['model'] != profile['model'] or digest != expected['policy']['sha256']:
        raise ValueError('Model or policy bytes differ from the booked Ultra package')
    options = ort.SessionOptions()
    options.inter_op_num_threads = options.intra_op_num_threads = 1
    options.log_severity_level = 4
    session = ort.InferenceSession(policy,options,providers=['CPUExecutionProvider'])
    names = profile['joint_names']
    meta = session.get_modelmeta().custom_metadata_map
    frames = expected['frames']
    if ([(i.name,i.shape,i.type) for i in sorted(session.get_inputs(),key=lambda i:i.name)] !=
            [('obs',[1,151],'tensor(float)'),('time_step',[1,1],'tensor(float)')] or
            meta.get('joint_names','').split(',') != names):
        raise ValueError('Runtime ONNX interface or joint order differs from the selected Ultra')
    params = {k:np.asarray(v) for k,v in profile['parameters'].items()}
    for key,values in params.items():
        declared = np.asarray([float(x) for x in meta[key].split(',')])
        if declared.shape != values.shape or not np.allclose(values,declared,rtol=0,atol=.001):
            raise ValueError('Unsupported Master Ultra controller parameter '+key)
    limits = [profile['limits'][name] for name in names]
    lo, hi, vel, effort = [np.array([j[k] for j in limits]) for k in ('lower_position','upper_position','max_velocity','max_effort')]
    known = digest == profile['qualified_policy_sha256']
    if not known: verify_scene(scene,profile)
    sim = None if known else UltraSimulation(scene,names,params,vel,effort)
    shapes = {k:(1,29) for k in ['actions','joint_pos','joint_vel']}
    shapes.update(body_pos_w=(1,14,3),body_quat_w=(1,14,4),body_lin_vel_w=(1,14,3),body_ang_vel_w=(1,14,3),motion_phase=(1,2))
    outputs = [o.name for o in session.get_outputs()]
    if set(outputs) != set(shapes)|set(params):
        raise ValueError('Missing native runtime policy outputs')
    observed = np.zeros((1,151),dtype=np.float32)
    if sim is not None: observed = sim.observation(params['default_joint_pos'],np.zeros(29))
    for frame in range(frames):
        inputs = {'obs':observed, 'time_step':np.array([[frame]],dtype=np.float32)}
        out = dict(zip(outputs,session.run(None,inputs)))
        if any(not np.isfinite(a).all() or a.dtype != np.float32 for a in out.values()) or any(out[n].shape != sh for n,sh in shapes.items()):
            raise ValueError('Runtime policy produced invalid shapes or non-finite values')
        if not np.array_equal(out['motion_phase'],[[0,frames-1]]):
            raise ValueError('Motion phase does not match the booked frame count')
        if any(out[k].shape not in ((29,),(1,29)) or not np.allclose(out[k].ravel(),v,rtol=0,atol=.001) for k,v in params.items()):
            raise ValueError('Runtime policy changed native gains, scales or default pose')
        if sim is not None:
            q,v = out['joint_pos'][0],out['joint_vel'][0]
            if (q < lo).any() or (q > hi).any() or (np.abs(v) > vel).any():
                raise ValueError('Reference motion exceeds native joint limits')
            sim.advance(out['actions'][0],lo,hi)
            observed = sim.observation(q,v)
    if sim is not None: sim.terminal()
    return {'policy_sha256':digest,'frames':frames,'model':profile['model'],
            'check':'exact-physically-recorded-policy' if known else 'ultra-closed-loop-simulation'}


if __name__ == '__main__':
    import site
    sys.path.append(site.getusersitepackages())  # Site-owned interpreter packages, never the submitted directory.
    job = bound_worker()
    manifest = json.loads(Path(sys.argv[2]).read_text())
    print(json.dumps(evaluate(Path(sys.argv[1]).read_bytes(),manifest,sys.argv[3] if len(sys.argv)>3 else None)))

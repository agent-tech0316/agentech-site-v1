# VORLD Build 52 verification

Build 52 adds the Showcase page: product selection, explicit operator readiness,
the calibrated reach-to-palms presentation, and a combined hand-guide/scene return.
The separately configured Spatial Memory service and OBS bridge remain required.
Opening VORLD or its Showcase page does not command the robot.

- Desktop tests: 412 passed, 5 skipped. All five new service tests passed.
- Packaged main, preload, Showcase screen and service match the validated source.
- Packaged app connected to the existing scene service and displayed its products
  and Ready status; movement controls were disabled without operator confirmation.
- Installer content was checked for accidental environment files and local data.
- Bundled general SDK catalog and runtime retain Build 51's audited behavior.
- No new live robot command was issued for this desktop release. Physical motion
  and calibration qualification belong to the configured scene installation.

The previous catalog audit is retained in desktop/SDK-AUDIT.md in the SDK repository.

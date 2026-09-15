Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcherScript = fso.BuildPath(scriptDir, "ensure-obs-running.ps1")

command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & launcherScript & Chr(34)

If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "repair-nvenc" Then
    command = command & " -RepairNvencFailure"
  End If
End If

Set shell = CreateObject("WScript.Shell")
result = shell.Run(command, 0, True)
WScript.Quit result

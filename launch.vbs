Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
cur = fso.GetParentFolderName(WScript.ScriptFullName)
desktopDir = cur & "\desktop"
ws.CurrentDirectory = desktopDir

electronExe = desktopDir & "\node_modules\electron\dist\electron.exe"
If fso.FileExists(electronExe) Then
  ws.Run """" & electronExe & """ . --disable-gpu --no-sandbox", 0, False
Else
  nodeExe = "node"
  If fso.FileExists("D:\Environment\Node\node.exe") Then
    nodeExe = "D:\Environment\Node\node.exe"
  End If
  ws.Run """" & nodeExe & """ start.js", 0, False
End If

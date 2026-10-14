Set ws = CreateObject("WScript.Shell")

paths = Array("C:\Users\23896\Desktop\Focus Flow.lnk", ws.SpecialFolders("Desktop") & "\Focus Flow.lnk")

For Each lnkPath In paths
  Set sc = ws.CreateShortcut(lnkPath)
  sc.TargetPath = "C:\Users\23896\Desktop\focus-flow\desktop\node_modules\electron\dist\electron.exe"
  sc.Arguments = ". --disable-gpu --no-sandbox"
  sc.WorkingDirectory = "C:\Users\23896\Desktop\focus-flow\desktop"
  sc.IconLocation = "C:\Users\23896\Desktop\focus-flow\desktop\assets\focus-obsidian.ico,0"
  sc.Description = "Focus Flow"
  sc.Save
  WScript.Echo "Saved: " & lnkPath
Next

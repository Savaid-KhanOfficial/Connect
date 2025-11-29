# Fix all hardcoded localhost URLs in React components
$files = @(
    "client/src/components/Login.jsx",
    "client/src/components/Signup.jsx",
    "client/src/components/Settings.jsx",
    "client/src/components/PeopleView.jsx",
    "client/src/components/RequestsView.jsx",
    "client/src/components/ChatWindow.jsx",
    "client/src/components/Chat.jsx"
)

foreach ($file in $files) {
    Write-Host "Fixing $file..."
    (Get-Content $file -Raw) -replace "http://localhost:3000", "" | Set-Content $file -NoNewline
}

Write-Host "Done! All localhost:3000 references removed."

; Alvea – Windows-Installer (Inno Setup 6 oder 7)
;
; Wird von installer\build.ps1 gebaut:
;   ISCC.exe /DAppVersion=1.0.0 /DStageDir=<build\stage> alvea.iss
;
; Aufbau der Installation:
;   {app}\node\       Node.js-Laufzeit (mitgeliefert)
;   {app}\app\        Programmdateien – werden bei jedem Update komplett ersetzt
;   {app}\service\    Windows-Dienst "Alvea" (WinSW)
;   {app}\data\       Datenbank, Uploads, Logs, Backups, alvea.env – bleibt immer erhalten
;   {app}\update.ps1  Updater (GitHub-Releases)
;
; Unbeaufsichtigt: Alvea-Setup.exe /VERYSILENT [/DIR="C:\Alvea"] [/PORT=37843] [/MIGRATE="C:\Apps\openclinic"]

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef StageDir
  #define StageDir "build\stage"
#endif
#ifndef OutputDir
  #define OutputDir "build\output"
#endif

#define AppName     "Alvea"
#define ServiceName "Alvea"
#define RepoUrl     "https://github.com/phillhf/alvea"
#define DefaultPort "37843"

[Setup]
AppId={{9C3F5E2A-7B41-4D8E-A6C2-1F0B8D4E7A35}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Alvea Contributors
AppPublisherURL={#RepoUrl}
AppSupportURL={#RepoUrl}/issues
AppUpdatesURL={#RepoUrl}/releases
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
UsePreviousTasks=yes
LicenseFile={#StageDir}\LICENSE
OutputDir={#OutputDir}
OutputBaseFilename=Alvea-Setup-{#AppVersion}
SetupIconFile=alvea.ico
UninstallDisplayIcon={app}\service\alvea.ico
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
MinVersion=10.0
WizardStyle=modern
CloseApplications=no
SetupLogging=yes

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"

[Messages]
de.WelcomeLabel2=Dieser Assistent installiert [name/ver] auf diesem Server.%n%nAlvea läuft anschließend als Windows-Dienst und ist im Netzwerk per Browser erreichbar (PC, iPad, Smartphone).%n%nDaten aus einer bestehenden Installation bleiben bei Updates erhalten.

[Tasks]
Name: "firewall"; Description: "Port in der Windows-Firewall freigeben (Zugriff von anderen Geräten im Netzwerk)"

[Dirs]
Name: "{app}\data"; Flags: uninsneveruninstall

[InstallDelete]
; Programmdateien vollständig ersetzen, damit keine veralteten Dateien liegen bleiben.
; {app}\data wird NIE angefasst.
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "{#StageDir}\node\*";    DestDir: "{app}\node";    Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\app\*";     DestDir: "{app}\app";     Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\service\*"; DestDir: "{app}\service"; Flags: ignoreversion recursesubdirs
Source: "{#StageDir}\tools\*";   DestDir: "{app}\tools";   Flags: ignoreversion recursesubdirs
Source: "{#StageDir}\update.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\LICENSE";    DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\NOTICE";     DestDir: "{app}"; Flags: ignoreversion

[INI]
Filename: "{app}\Alvea.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{code:GetPort}"

[Icons]
Name: "{group}\Alvea öffnen";            Filename: "{app}\Alvea.url"; IconFilename: "{app}\service\alvea.ico"
Name: "{group}\Nach Updates suchen";     Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\update.ps1"""; IconFilename: "{app}\service\alvea.ico"
Name: "{group}\Konfiguration bearbeiten"; Filename: "{sys}\notepad.exe"; Parameters: """{app}\data\alvea.env"""
Name: "{group}\Protokolle";              Filename: "{app}\data\logs"
Name: "{group}\Alvea deinstallieren";    Filename: "{uninstallexe}"

[Run]
Filename: "http://localhost:{code:GetPort}"; Description: "Alvea jetzt im Browser öffnen"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "{app}\service\alvea-service.exe"; Parameters: "stopwait";  Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{app}\service\alvea-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""Alvea Update"" /F";               Flags: runhidden waituntilterminated; RunOnceId: "RemoveTask"
Filename: "{sys}\netsh.exe";    Parameters: "advfirewall firewall delete rule name=""Alvea"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewall"

[UninstallDelete]
Type: files; Name: "{app}\Alvea.url"

[Code]
var
  PortPage: TInputQueryWizardPage;
  MigratePage: TInputQueryWizardPage;
  SetupFailed: Boolean;
  BrowseButton: TNewButton;

function EnvFile: String;
begin
  Result := ExpandConstant('{app}\data\alvea.env');
end;

function IsUpgrade: Boolean;
begin
  Result := FileExists(EnvFile);
end;

{ Liest KEY=Wert aus der .env (ohne Kommentare) }
function ReadEnvValue(const FileName, Key, Default: String): String;
var
  Lines: TArrayOfString;
  I, P: Integer;
  L: String;
begin
  Result := Default;
  if not LoadStringsFromFile(FileName, Lines) then exit;
  for I := 0 to GetArrayLength(Lines) - 1 do
  begin
    L := Trim(Lines[I]);
    if Pos(Key + '=', L) = 1 then
    begin
      L := Copy(L, Length(Key) + 2, MaxInt);
      P := Pos('#', L);
      if P > 0 then L := Copy(L, 1, P - 1);
      Result := Trim(L);
      exit;
    end;
  end;
end;

function IsValidPort(const S: String): Boolean;
var
  N: Integer;
begin
  N := StrToIntDef(Trim(S), 0);
  Result := (N >= 1) and (N <= 65535);
end;

function GetPort(Param: String): String;
begin
  Result := Trim(PortPage.Values[0]);
  { Unbeaufsichtigtes Update: bestehenden Port beibehalten }
  if WizardSilent and IsUpgrade and (ExpandConstant('{param:PORT|}') = '') then
    Result := ReadEnvValue(EnvFile, 'PORT', Result);
  if not IsValidPort(Result) then Result := '{#DefaultPort}';
end;

function ServiceExists(const Name: String): Boolean;
var
  RC: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\sc.exe'), 'query ' + Name, '', SW_HIDE, ewWaitUntilTerminated, RC) and (RC = 0);
end;

{ Ordner einer alten OpenClinic-/Bettenaufbereitung-Installation über den NSSM-Dienst finden }
function DetectOldInstall: String;
var
  V: String;
begin
  Result := '';
  if RegQueryStringValue(HKLM, 'SYSTEM\CurrentControlSet\Services\OpenClinic\Parameters', 'AppDirectory', V) or
     RegQueryStringValue(HKLM, 'SYSTEM\CurrentControlSet\Services\Bettenaufbereitung\Parameters', 'AppDirectory', V) then
  begin
    V := RemoveBackslashUnlessRoot(V);
    if CompareText(ExtractFileName(V), 'backend') = 0 then V := ExtractFileDir(V);
    if DirExists(V) then Result := V;
  end;
end;

procedure BrowseOldInstall(Sender: TObject);
var
  Dir: String;
begin
  Dir := MigratePage.Values[0];
  if BrowseForFolder('Ordner der alten OpenClinic-Installation wählen', Dir, False) then
    MigratePage.Values[0] := Dir;
end;

procedure InitializeWizard;
begin
  PortPage := CreateInputQueryPage(wpSelectDir,
    'Netzwerk',
    'Unter welchem Port soll Alvea erreichbar sein?',
    'Alvea ist danach im Netzwerk unter http://<Servername>:<Port> erreichbar.' + #13#10 +
    'Der Port darf nicht von einem anderen Programm belegt sein. Standard: {#DefaultPort}.');
  PortPage.Add('&Port:', False);
  PortPage.Values[0] := ExpandConstant('{param:PORT|{#DefaultPort}}');

  MigratePage := CreateInputQueryPage(PortPage.ID,
    'Bestehende Installation übernehmen',
    'Daten aus einer früheren OpenClinic-Installation übernehmen?',
    'Läuft auf diesem Server bereits OpenClinic (bzw. "Bettenaufbereitung"), können Datenbank, ' +
    'hochgeladene Dateien und Anmeldeschlüssel übernommen werden. Der alte Dienst wird dabei ' +
    'gestoppt und deaktiviert, aber nicht gelöscht.' + #13#10#13#10 +
    'Feld leer lassen, um mit einer neuen, leeren Datenbank zu starten.');
  MigratePage.Add('Ordner der alten Installation (enthält den Unterordner "backend"):', False);
  MigratePage.Values[0] := ExpandConstant('{param:MIGRATE|}');
  if MigratePage.Values[0] = '' then
    MigratePage.Values[0] := DetectOldInstall;

  BrowseButton := TNewButton.Create(MigratePage);
  BrowseButton.Parent := MigratePage.Surface;
  BrowseButton.Caption := 'Durchsuchen...';
  BrowseButton.Width := ScaleX(100);
  BrowseButton.Height := WizardForm.NextButton.Height;
  BrowseButton.Top := MigratePage.Edits[0].Top + MigratePage.Edits[0].Height + ScaleY(8);
  BrowseButton.Left := MigratePage.Surface.Width - BrowseButton.Width;
  BrowseButton.Anchors := [akTop, akRight];
  BrowseButton.OnClick := @BrowseOldInstall;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  { Bei erneuter Installation den bisherigen Port vorschlagen }
  if (CurPageID = PortPage.ID) and IsUpgrade and (ExpandConstant('{param:PORT|}') = '') then
    PortPage.Values[0] := ReadEnvValue(EnvFile, 'PORT', PortPage.Values[0]);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  { Übernahme nur bei Erstinstallation anbieten }
  Result := (PageID = MigratePage.ID) and IsUpgrade;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Dir: String;
begin
  Result := True;
  if CurPageID = PortPage.ID then
  begin
    if not IsValidPort(PortPage.Values[0]) then
    begin
      MsgBox('Bitte einen Port zwischen 1 und 65535 eingeben.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = MigratePage.ID then
  begin
    Dir := Trim(MigratePage.Values[0]);
    if (Dir <> '') and not DirExists(AddBackslash(Dir) + 'backend') then
    begin
      MsgBox('Im angegebenen Ordner wurde kein Unterordner "backend" gefunden.' + #13#10 +
             'Bitte den Hauptordner der alten Installation wählen oder das Feld leeren.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo,
  MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo + NewLine + NewLine +
            'Port:' + NewLine + Space + GetPort('') + NewLine;
  if (not IsUpgrade) and (Trim(MigratePage.Values[0]) <> '') then
    Result := Result + NewLine + 'Daten übernehmen aus:' + NewLine + Space + Trim(MigratePage.Values[0]) + NewLine;
  if MemoTasksInfo <> '' then
    Result := Result + NewLine + MemoTasksInfo + NewLine;
end;

{ Laufenden Dienst vor dem Kopieren stoppen (node.exe ist sonst gesperrt) }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  RC: Integer;
  Svc: String;
begin
  Result := '';
  if ServiceExists('{#ServiceName}') then
  begin
    Svc := ExpandConstant('{app}\service\alvea-service.exe');
    if FileExists(Svc) then
      Exec(Svc, 'stopwait', '', SW_HIDE, ewWaitUntilTerminated, RC)
    else
    begin
      Exec(ExpandConstant('{sys}\sc.exe'), 'stop {#ServiceName}', '', SW_HIDE, ewWaitUntilTerminated, RC);
      Sleep(5000);
    end;
  end;
end;

procedure Fail(const Msg: String);
begin
  SetupFailed := True;
  Log('FEHLER: ' + Msg);
  SuppressibleMsgBox(Msg + #13#10#13#10 + 'Details: ' + ExpandConstant('{app}\data\logs\install.log'),
    mbCriticalError, MB_OK, IDOK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  RC: Integer;
  Params, Svc, MigrateDir: String;
begin
  if CurStep <> ssPostInstall then exit;

  { 1. Konfiguration, Datenübernahme, Datenbank }
  WizardForm.StatusLabel.Caption := 'Konfiguration und Datenbank werden eingerichtet...';
  Params := '"' + ExpandConstant('{app}\tools\configure.js') + '" --home "' + ExpandConstant('{app}') + '" --port ' + GetPort('');
  MigrateDir := Trim(MigratePage.Values[0]);
  if (not IsUpgrade) and (MigrateDir <> '') then
    Params := Params + ' --migrate "' + RemoveBackslashUnlessRoot(MigrateDir) + '"';
  if WizardIsTaskSelected('firewall') then
    Params := Params + ' --firewall';
  Log('configure.js ' + Params);
  if not Exec(ExpandConstant('{app}\node\node.exe'), Params, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, RC) or (RC <> 0) then
  begin
    Fail('Die Einrichtung von Konfiguration bzw. Datenbank ist fehlgeschlagen (Code ' + IntToStr(RC) + ').');
    exit;
  end;

  { 2. Windows-Dienst installieren und starten }
  WizardForm.StatusLabel.Caption := 'Windows-Dienst "{#ServiceName}" wird gestartet...';
  Svc := ExpandConstant('{app}\service\alvea-service.exe');
  if not ServiceExists('{#ServiceName}') then
  begin
    if not Exec(Svc, 'install', '', SW_HIDE, ewWaitUntilTerminated, RC) or (RC <> 0) then
    begin
      Fail('Der Windows-Dienst konnte nicht installiert werden (Code ' + IntToStr(RC) + ').');
      exit;
    end;
  end;
  if not Exec(Svc, 'start', '', SW_HIDE, ewWaitUntilTerminated, RC) or (RC <> 0) then
    Fail('Der Windows-Dienst konnte nicht gestartet werden (Code ' + IntToStr(RC) + '). Ist der Port ' + GetPort('') + ' bereits belegt?');
end;

function GetCustomSetupExitCode: Integer;
begin
  if SetupFailed then Result := 10 else Result := 0;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    SuppressibleMsgBox('Alvea wurde entfernt.' + #13#10#13#10 +
      'Datenbank, Uploads und Sicherungen wurden NICHT gelöscht:' + #13#10 +
      ExpandConstant('{app}\data'), mbInformation, MB_OK, IDOK);
end;

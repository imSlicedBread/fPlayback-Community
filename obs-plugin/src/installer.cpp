// SPDX-License-Identifier: GPL-2.0-or-later
#define UNICODE
#define _UNICODE
#include "installer-core.hpp"
#include <shlobj.h>
#include <tlhelp32.h>
#include <shellapi.h>

namespace pi=playback_installer;
static HWND folderField,statusField,installButton;
static HFONT font;
static std::wstring selectedFolder;
static std::wstring folderText() {
  int size=GetWindowTextLengthW(folderField);
  std::wstring value(size+1,L'\0'); GetWindowTextW(folderField,value.data(),size+1); value.resize(size);
  return value;
}
static bool obsRunning() {
  HANDLE snapshot=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);
  if (snapshot==INVALID_HANDLE_VALUE) throw std::runtime_error("Could not check whether OBS is running.");
  PROCESSENTRY32W entry{}; entry.dwSize=sizeof(entry); bool running=false;
  if (Process32FirstW(snapshot,&entry)) do {
    if (!_wcsicmp(entry.szExeFile,L"obs64.exe")) {running=true;break;}
  } while (Process32NextW(snapshot,&entry));
  CloseHandle(snapshot); return running;
}
static std::wstring detectFolder() {
  std::error_code error;
  for (HKEY hive:{HKEY_LOCAL_MACHINE,HKEY_CURRENT_USER}) {
    wchar_t value[32768]{}; DWORD size=sizeof(value);
    if (RegGetValueW(hive,L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OBS Studio",L"InstallLocation",
        RRF_RT_REG_SZ,nullptr,value,&size)==ERROR_SUCCESS && pi::fs::exists(pi::fs::path(value)/L"bin/64bit/obs64.exe",error)) return value;
  }
  PWSTR programFiles=nullptr; std::wstring result;
  if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_ProgramFiles,0,nullptr,&programFiles))) {
    const auto path=pi::fs::path(programFiles)/L"obs-studio";
    if (pi::fs::exists(path/L"bin/64bit/obs64.exe",error)) result=path.wstring();
    CoTaskMemFree(programFiles);
  }
  return result;
}
static pi::Payload resource(int id,const wchar_t *relative) {
  HMODULE module=GetModuleHandleW(nullptr); HRSRC entry=FindResourceW(module,MAKEINTRESOURCEW(id),RT_RCDATA);
  HGLOBAL data=entry ? LoadResource(module,entry) : nullptr;
  const auto *bytes=data ? static_cast<const unsigned char *>(LockResource(data)) : nullptr;
  DWORD size=entry ? SizeofResource(module,entry) : 0;
  if (!bytes || !size) throw std::runtime_error("Installer payload is missing. Download the installer again.");
  return {relative,bytes,size};
}
static HWND control(HWND parent,const wchar_t *type,const wchar_t *text,DWORD style,int x,int y,int w,int h,int id=0) {
  HWND child=CreateWindowExW(0,type,text,WS_CHILD|WS_VISIBLE|style,x,y,w,h,parent,reinterpret_cast<HMENU>(INT_PTR(id)),GetModuleHandleW(nullptr),nullptr);
  SendMessageW(child,WM_SETFONT,reinterpret_cast<WPARAM>(font),TRUE); return child;
}
static LRESULT CALLBACK windowProc(HWND window,UINT message,WPARAM wp,LPARAM lp) {
  switch (message) {
  case WM_CREATE:
    font=CreateFontW(-16,0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,DEFAULT_QUALITY,DEFAULT_PITCH,L"Segoe UI");
    control(window,L"STATIC",L"Install the fKey Playback plugin for OBS",0,24,20,540,27);
    control(window,L"STATIC",pi::obs33?L"Close OBS first. Scenes, settings and YouTube login stay in place.\nOBS 33.0.0 and 33.0.1 / Chromium 150 (Windows x64).":L"Close OBS first. Scenes, settings and YouTube login stay in place.\nOBS 32.2.2 / Chromium 127 build (Windows x64).",0,24,56,540,48);
    control(window,L"STATIC",L"OBS installation folder",0,24,119,540,22);
    folderField=control(window,L"EDIT",detectFolder().c_str(),WS_BORDER|WS_TABSTOP|ES_AUTOHSCROLL,24,145,430,27,101);
    control(window,L"BUTTON",L"Browse...",WS_TABSTOP,464,144,100,29,102);
    statusField=control(window,L"STATIC",L"Choose your OBS folder, then click Install / Update.",0,24,190,540,62);
    control(window,L"STATIC",L"GPL-2.0-or-later. Plugin source and license are included.\nAn existing plugin is backed up before it is replaced.",0,24,261,540,46);
    installButton=control(window,L"BUTTON",L"Install / Update",WS_TABSTOP|BS_DEFPUSHBUTTON,24,326,154,34,103);
    control(window,L"BUTTON",L"Close",WS_TABSTOP,444,326,120,34,105);
    return 0;
  case WM_COMMAND:
    if (LOWORD(wp)==102) {
      IFileDialog *dialog=nullptr;
      if (SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&dialog)))) {
        dialog->SetOptions(FOS_PICKFOLDERS|FOS_FORCEFILESYSTEM|FOS_PATHMUSTEXIST);
        dialog->SetTitle(L"Choose the OBS installation folder");
        if (SUCCEEDED(dialog->Show(window))) {
          IShellItem *item=nullptr;
          if (SUCCEEDED(dialog->GetResult(&item))) {
            PWSTR path=nullptr;
            if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH,&path))) {SetWindowTextW(folderField,path);CoTaskMemFree(path);}
            item->Release();
          }
        }
        dialog->Release();
      }
    } else if (LOWORD(wp)==103) {
      try {
        if (obsRunning()) throw std::runtime_error("OBS is still open. Close OBS, then click Install / Update again.");
        selectedFolder=folderText(); pi::validate(selectedFolder);
        EnableWindow(installButton,FALSE);
        pi::install(selectedFolder,{resource(101,L"obs-plugins/64bit/fplayback-youtube.dll"),
          resource(102,L"data/obs-plugins/fplayback-youtube/source.zip"),resource(103,L"data/obs-plugins/fplayback-youtube/LICENSE")});
        SetWindowTextW(statusField,L"Installed and verified. Open OBS, then choose Docks > fKey Playback.\nClick Add Playback source to current scene to add video and overlay.");
      } catch (const std::exception &error) {
        std::string text=error.what(); std::wstring wide(text.begin(),text.end());
        MessageBoxW(window,wide.c_str(),L"fKey Playback setup",MB_OK|MB_ICONERROR);
        EnableWindow(installButton,TRUE);
      }
    } else if (LOWORD(wp)==105) DestroyWindow(window);
    return 0;
  case WM_DESTROY: DeleteObject(font); PostQuitMessage(0); return 0;
  }
  return DefWindowProcW(window,message,wp,lp);
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,PWSTR,int) {
  CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
  WNDCLASSW type{}; type.lpfnWndProc=windowProc; type.hInstance=instance;
  type.lpszClassName=L"fKeyPlaybackPluginInstaller"; type.hCursor=LoadCursorW(nullptr,IDC_ARROW);
  type.hbrBackground=reinterpret_cast<HBRUSH>(COLOR_WINDOW+1); RegisterClassW(&type);
  HWND window=CreateWindowExW(0,type.lpszClassName,L"fKey Playback - OBS Plugin Setup",WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX,
    CW_USEDEFAULT,CW_USEDEFAULT,610,415,nullptr,nullptr,instance,nullptr);
  if (!window) {CoUninitialize();return 1;}
  ShowWindow(window,SW_SHOW); MSG message{};
  while(GetMessageW(&message,nullptr,0,0)>0) {
    if (!IsDialogMessageW(window,&message)) {TranslateMessage(&message);DispatchMessageW(&message);}
  }
  CoUninitialize(); return static_cast<int>(message.wParam);
}

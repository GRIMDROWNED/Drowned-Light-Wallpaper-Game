using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace DrownedLight
{
    static class Program
    {
        [STAThread]
        static Mutex single;
        static void Main(string[] args)
        {
            single = new Mutex(true, "DrownedLightDesktop", out bool first);
            // opening the app again while it runs (the wallpaper is going) brings up the game in the running copy
            using var show = new EventWaitHandle(false, EventResetMode.AutoReset, "DrownedLightDesktopShow");
            if (!first) { show.Set(); return; }
            ApplicationConfiguration.Initialize();
            Application.Run(new TrayApp(Array.Exists(args, a => a == "--startup"), Array.Exists(args, a => a == "--updated"), show));
        }

        /// <summary>Lets go of the one-copy lock so the updated exe can start while this copy closes.</summary>
        internal static void ReleaseLock() { try { single.ReleaseMutex(); } catch { } single.Dispose(); }
    }

    /// <summary>Unpacks the game, owns the tray icon, the wallpaper and the play window.</summary>
    class TrayApp : ApplicationContext
    {
        internal static readonly string Home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DrownedLight");
        internal static readonly string Www = Path.Combine(Home, "www");
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

        readonly NotifyIcon tray;
        readonly ToolStripMenuItem wallItem, startItem;
        WallpaperForm wall;
        PlayForm play;
        readonly SynchronizationContext ui;
        bool updateReady, updating;

        public TrayApp(bool startup, bool updated, EventWaitHandle show)
        {
            ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
            new Thread(() => { while (show.WaitOne()) ui.Post(_ => ShowPlay(), null); }) { IsBackground = true }.Start();
            Unpack();
            wallItem = new ToolStripMenuItem("Wallpaper on", null, (s, e) => SetWall(wall == null));
            startItem = new ToolStripMenuItem("Start with Windows", null, (s, e) => SetStartup(!IsStartup()));
            var menu = new ContextMenuStrip();
            menu.Items.Add("Play Drowned Light", null, (s, e) => ShowPlay());
            menu.Items.Add(wallItem);
            menu.Items.Add(startItem);
            menu.Items.Add("Check for updates", null, async (s, e) => await CheckNow());
            menu.Items.Add(new ToolStripMenuItem("Version " + Updater.Build) { Enabled = false });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Quit", null, (s, e) => Quit());
            menu.Opening += (s, e) => { wallItem.Checked = wall != null; startItem.Checked = IsStartup(); };
            tray = new NotifyIcon { Icon = LoadIcon(), Text = "Drowned Light", ContextMenuStrip = menu, Visible = true };
            tray.DoubleClick += (s, e) => ShowPlay();
            SetWall(true);
            DesktopClicks.Start(() => { if (wall != null) ShowPlay(); }); // double-click empty desktop space: play
            Updater.Cleanup();
            _ = UpdateLoop();
            if (updated) tray.ShowBalloonTip(4000, "Drowned Light", "Updated to version " + Updater.Build + ".", ToolTipIcon.None);
            if (startup) return; // signing in to Windows (or restarting after an update): just the wallpaper
            ShowPlay(); // one app for everything: the wallpaper is set and the game opens
            tray.ShowBalloonTip(4000, "Drowned Light", "The knights fight behind your desktop icons. Double-click an empty spot on the desktop to play. Closing the game keeps the wallpaper; right-click the knight by the clock to switch it off or quit.", ToolTipIcon.None);
        }

        internal static Icon LoadIcon()
        {
            using var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("icon.ico");
            return s != null ? new Icon(s) : SystemIcons.Application;
        }

        /// <summary>Copies the embedded game into %LOCALAPPDATA%\DrownedLight\www when this build's copy isn't there yet.</summary>
        static void Unpack()
        {
            string stamp = Path.Combine(Www, ".build");
            string build = File.GetLastWriteTimeUtc(Environment.ProcessPath ?? "").Ticks.ToString() + Application.ProductVersion;
            if (File.Exists(stamp) && File.ReadAllText(stamp) == build) return;
            if (Directory.Exists(Www)) Directory.Delete(Www, true);
            Directory.CreateDirectory(Www);
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("www.zip"))
            using (var zip = new ZipArchive(s, ZipArchiveMode.Read)) zip.ExtractToDirectory(Www);
            File.WriteAllText(stamp, build);
        }

        void SetWall(bool on)
        {
            if (on && wall == null) { wall = new WallpaperForm(); wall.FormClosed += (s, e) => wall = null; wall.Show(); }
            else if (!on && wall != null) { wall.Close(); wall = null; Desktop.Refresh(); }
        }

        void ShowPlay()
        {
            if (play == null || play.IsDisposed) { play = new PlayForm(); play.FormClosed += (s, e) => { play = null; if (updateReady) ui.Post(_ => Restart(), null); }; play.Show(); }
            else { if (play.WindowState == FormWindowState.Minimized) play.WindowState = FormWindowState.Normal; play.Activate(); }
        }

        static bool IsStartup()
        {
            using var k = Registry.CurrentUser.OpenSubKey(RunKey);
            return k?.GetValue("DrownedLight") != null;
        }
        static void SetStartup(bool on)
        {
            using var k = Registry.CurrentUser.CreateSubKey(RunKey);
            if (on) k.SetValue("DrownedLight", "\"" + Environment.ProcessPath + "\" --startup");
            else k.DeleteValue("DrownedLight", false);
        }

        /// <summary>Soon after starting and then every 6 hours: fetch a newer build in the background.</summary>
        async Task UpdateLoop()
        {
            await Task.Delay(TimeSpan.FromSeconds(30));
            while (!updateReady)
            {
                await Fetch(false);
                await Task.Delay(TimeSpan.FromHours(6));
            }
        }

        async Task CheckNow()
        {
            if (updateReady) { if (play == null) Restart(); else tray.ShowBalloonTip(4000, "Drowned Light", "The update installs when you close the game window.", ToolTipIcon.None); return; }
            if (!await Fetch(true)) tray.ShowBalloonTip(3000, "Drowned Light", "You have the newest version (" + Updater.Build + ").", ToolTipIcon.None);
        }

        /// <summary>Downloads a newer exe if there is one. With the game window closed it swaps it in straight away; otherwise when the window closes.</summary>
        async Task<bool> Fetch(bool asked)
        {
            if (updating || updateReady) return updateReady;
            updating = true;
            int got = 0;
            try { got = await Updater.Fetch(); }
            catch { if (asked) tray.ShowBalloonTip(3000, "Drowned Light", "Couldn't reach the update server. Try again later.", ToolTipIcon.None); }
            updating = false;
            if (got == 0) return false;
            updateReady = true;
            if (play == null) Restart();
            else tray.ShowBalloonTip(5000, "Drowned Light", "Version " + got + " is downloaded. It installs when you close the game window.", ToolTipIcon.None);
            return true;
        }

        /// <summary>Puts the downloaded exe in place of this one and starts it, keeping the wallpaper going.</summary>
        void Restart()
        {
            if (!Updater.Swap())
            {
                updateReady = false;
                tray.ShowBalloonTip(5000, "Drowned Light", "The update couldn't be installed in this folder. Move DrownedLight.exe to Documents or the desktop and it will update itself.", ToolTipIcon.Warning);
                return;
            }
            DesktopClicks.Stop();
            wall?.Close();
            tray.Visible = false;
            Program.ReleaseLock();
            try { Process.Start(new ProcessStartInfo(Environment.ProcessPath, "--startup --updated") { UseShellExecute = false }); }
            catch { Updater.Undo(); }
            ExitThread();
        }

        void Quit()
        {
            DesktopClicks.Stop();
            SetWall(false);
            play?.Close();
            tray.Visible = false;
            ExitThread();
        }
    }

    /// <summary>Self-update from the "windows" GitHub release: version.txt holds the newest build number, DrownedLight.exe the exe.
    /// Windows lets a running exe be renamed, so the old one moves aside to .old and the new one takes its name.</summary>
    static class Updater
    {
        const string Release = "https://github.com/GRIMDROWNED/Drowned-Light-Wallpaper-Game/releases/download/windows/";
        internal static int Build => Assembly.GetExecutingAssembly().GetName().Version?.Build ?? 0;
        static string Exe => Environment.ProcessPath;
        static string NewExe => Exe + ".new";
        static string OldExe => Exe + ".old";

        internal static void Cleanup()
        {
            try { if (File.Exists(OldExe)) File.Delete(OldExe); } catch { }
            try { if (File.Exists(NewExe)) File.Delete(NewExe); } catch { }
        }

        /// <summary>Returns the new build number once its exe is saved next to this one, or 0 when this is the newest.</summary>
        internal static async Task<int> Fetch()
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(15) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("DrownedLight-desktop");
            string txt = await http.GetStringAsync(Release + "version.txt");
            if (!int.TryParse(txt.Trim(), out int latest) || latest <= Build) return 0;
            using (var r = await http.GetStreamAsync(Release + "DrownedLight.exe"))
            using (var f = File.Create(NewExe)) await r.CopyToAsync(f);
            if (new FileInfo(NewExe).Length < 20_000_000) { File.Delete(NewExe); return 0; } // a cut-off download
            return latest;
        }

        internal static bool Swap()
        {
            try
            {
                if (!File.Exists(NewExe)) return false;
                if (File.Exists(OldExe)) File.Delete(OldExe);
                File.Move(Exe, OldExe);
                File.Move(NewExe, Exe);
                return true;
            }
            catch { Undo(); return false; }
        }

        internal static void Undo()
        {
            try { if (!File.Exists(Exe) && File.Exists(OldExe)) File.Move(OldExe, Exe); } catch { }
        }
    }

    /// <summary>A WebView2 showing a page of the unpacked game, served as https://drowned.local/.</summary>
    static class Web
    {
        internal static async Task Load(WebView2 view, string page)
        {
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(TrayApp.Home, "webview"));
            await view.EnsureCoreWebView2Async(env);
            var core = view.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping("drowned.local", TrayApp.Www, CoreWebView2HostResourceAccessKind.Allow);
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.NewWindowRequested += (s, e) => e.Handled = true;
            core.Navigate("https://drowned.local/" + page);
        }
    }

    /// <summary>The play window: the full game with menus, keyboard, mouse and pad. F11 toggles full screen.</summary>
    class PlayForm : Form
    {
        readonly WebView2 view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(10, 20, 32) };
        FormWindowState before;
        public PlayForm()
        {
            Text = "Drowned Light";
            Icon = TrayApp.LoadIcon();
            ClientSize = new Size(1280, 720);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(10, 20, 32);
            KeyPreview = true;
            Controls.Add(view);
            Load += async (s, e) =>
            {
                await Web.Load(view, "index.html");
                // F11 inside the page asks the window to go full screen
                await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                    "addEventListener('keydown', e => { if (e.key === 'F11') { e.preventDefault(); chrome.webview.postMessage('f11'); } });");
                view.CoreWebView2.WebMessageReceived += (o, a) => { if (a.TryGetWebMessageAsString() == "f11") ToggleFull(); };
                view.CoreWebView2.Reload();
            };
        }
        void ToggleFull()
        {
            if (FormBorderStyle != FormBorderStyle.None) { before = WindowState; FormBorderStyle = FormBorderStyle.None; WindowState = FormWindowState.Normal; Bounds = Screen.FromControl(this).Bounds; }
            else { FormBorderStyle = FormBorderStyle.Sizable; WindowState = before; }
        }
        protected override void OnFormClosed(FormClosedEventArgs e) { view.Dispose(); base.OnFormClosed(e); }
    }

    /// <summary>The wallpaper: a borderless window re-parented into the desktop's WorkerW, behind the icons, over the main screen.</summary>
    class WallpaperForm : Form
    {
        readonly WebView2 view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(10, 20, 32) };
        readonly System.Windows.Forms.Timer watch = new System.Windows.Forms.Timer { Interval = 2000 };
        bool paused;

        public WallpaperForm()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(10, 20, 32);
            Bounds = Screen.PrimaryScreen.Bounds;
            Controls.Add(view);
            Load += async (s, e) => { Desktop.Attach(this); await Web.Load(view, "wallpaper.html"); };
            // pause while a full-screen app or game covers the desktop
            watch.Tick += (s, e) =>
            {
                bool cover = Desktop.FullscreenAppOnTop();
                if (cover == paused || view.CoreWebView2 == null) return;
                paused = cover;
                view.Visible = !cover; // WebView2 only suspends while hidden
                if (cover) _ = view.CoreWebView2.TrySuspendAsync(); else view.CoreWebView2.Resume();
            };
            watch.Start();
            SystemEvents.DisplaySettingsChanged += OnDisplay;
        }
        void OnDisplay(object s, EventArgs e) => BeginInvoke(new Action(() => Desktop.Attach(this)));
        protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x80 /* WS_EX_TOOLWINDOW */ | 0x08000000 /* WS_EX_NOACTIVATE */; return cp; } }
        protected override bool ShowWithoutActivation => true;
        protected override void OnFormClosed(FormClosedEventArgs e) { SystemEvents.DisplaySettingsChanged -= OnDisplay; watch.Dispose(); view.Dispose(); base.OnFormClosed(e); }
    }

    /// <summary>The usual trick for drawing behind the desktop icons (as wallpaper apps do).</summary>
    static class Desktop
    {
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string name);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
        [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
        delegate bool EnumProc(IntPtr h, IntPtr l);
        [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
        [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);
        [DllImport("user32.dll")] static extern bool MapWindowPoints(IntPtr from, IntPtr to, ref RECT pts, uint n);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SystemParametersInfo(uint act, uint p, System.Text.StringBuilder s, uint win);
        [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }

        /// <summary>Puts the form behind the icons, covering the main screen.</summary>
        internal static void Attach(Form f)
        {
            IntPtr progman = FindWindow("Progman", null);
            SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), 0, 1000, out _); // ask Explorer for a WorkerW
            SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out _);
            IntPtr worker = IntPtr.Zero;
            EnumWindows((top, l) =>
            {
                if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                    worker = FindWindowEx(IntPtr.Zero, top, "WorkerW", null); // classic: the WorkerW after the icons' window
                return true;
            }, IntPtr.Zero);
            if (worker == IntPtr.Zero) worker = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null); // Windows 11 24H2: WorkerW inside Progman
            if (worker == IntPtr.Zero) worker = progman;
            SetParent(f.Handle, worker);
            var r = new RECT { L = Screen.PrimaryScreen.Bounds.Left, T = Screen.PrimaryScreen.Bounds.Top, R = Screen.PrimaryScreen.Bounds.Right, B = Screen.PrimaryScreen.Bounds.Bottom };
            MapWindowPoints(IntPtr.Zero, worker, ref r, 2); // screen -> WorkerW coordinates
            IntPtr bottom = new IntPtr(1);
            SetWindowPos(f.Handle, worker == progman ? bottom : IntPtr.Zero, r.L, r.T, r.R - r.L, r.B - r.T, 0x0010 /* NOACTIVATE */ | 0x0040 /* SHOWWINDOW */);
        }

        /// <summary>Redraws the normal wallpaper after ours is switched off.</summary>
        internal static void Refresh()
        {
            var path = new System.Text.StringBuilder(520);
            if (SystemParametersInfo(0x0073 /* SPI_GETDESKWALLPAPER */, 520, path, 0))
                SystemParametersInfo(0x0014 /* SPI_SETDESKWALLPAPER */, 0, path, 0x01 | 0x02);
        }

        /// <summary>True when the foreground window (not the desktop) fills its whole screen.</summary>
        internal static bool FullscreenAppOnTop()
        {
            IntPtr fg = GetForegroundWindow();
            if (fg == IntPtr.Zero) return false;
            var cls = new System.Text.StringBuilder(64); GetClassName(fg, cls, 64);
            string c = cls.ToString();
            if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return false;
            if (!GetWindowRect(fg, out RECT r)) return false;
            var s = Screen.FromHandle(fg).Bounds;
            return r.L <= s.Left && r.T <= s.Top && r.R >= s.Right && r.B >= s.Bottom;
        }
    }
    /// <summary>
    /// Watches for a double-click on empty desktop space (not on an icon, the taskbar or a window) with a low-level
    /// mouse hook, the way wallpaper apps do, and calls back. Icons are told apart through accessibility roles.
    /// </summary>
    static class DesktopClicks
    {
        delegate IntPtr HookProc(int code, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc f, IntPtr mod, uint thread);
        [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
        [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
        [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
        [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
        [DllImport("oleacc.dll")] static extern int AccessibleObjectFromPoint(Point p, [MarshalAs(UnmanagedType.Interface)] out Accessibility.IAccessible acc, out object child);
        [StructLayout(LayoutKind.Sequential)] struct MSLL { public Point pt; public uint data, flags, time; public IntPtr extra; }

        static IntPtr hook;
        static HookProc proc; // kept alive while hooked
        static Action onDouble;
        static uint lastTime; static Point lastPt;

        internal static void Start(Action action)
        {
            if (hook != IntPtr.Zero) return;
            onDouble = action;
            proc = Hook;
            hook = SetWindowsHookEx(14 /* WH_MOUSE_LL */, proc, GetModuleHandle(null), 0);
        }
        internal static void Stop() { if (hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; } }

        static IntPtr Hook(int code, IntPtr w, IntPtr l)
        {
            if (code >= 0 && (int)w == 0x0201 /* WM_LBUTTONDOWN */)
            {
                var m = Marshal.PtrToStructure<MSLL>(l);
                var size = SystemInformation.DoubleClickSize;
                bool dbl = m.time - lastTime <= (uint)SystemInformation.DoubleClickTime
                    && Math.Abs(m.pt.X - lastPt.X) <= size.Width && Math.Abs(m.pt.Y - lastPt.Y) <= size.Height;
                lastTime = dbl ? 0 : m.time; lastPt = m.pt;
                // the icon check talks to Explorer, so it runs after the hook returns (a slow hook lags the mouse)
                if (dbl) { var a = onDouble; var pt = m.pt; SynchronizationContext.Current?.Post(_ => { if (OnEmptyDesktop(pt)) a?.Invoke(); }, null); }
            }
            return CallNextHookEx(hook, code, w, l);
        }

        /// <summary>The point is on the desktop's icon view itself, not on one of its icons.</summary>
        static bool OnEmptyDesktop(Point p)
        {
            IntPtr h = WindowFromPoint(p);
            if (Cls(h) != "SysListView32" || Cls(GetParent(h)) != "SHELLDLL_DefView") return false;
            try
            {
                if (AccessibleObjectFromPoint(p, out var acc, out object child) != 0 || acc == null) return false;
                object role = acc.get_accRole(child);
                return role is int r && r == 0x21; // ROLE_SYSTEM_LIST: the empty view (an icon is 0x22, a list item)
            }
            catch { return false; }
        }
        static string Cls(IntPtr h) { var b = new System.Text.StringBuilder(64); GetClassName(h, b, 64); return b.ToString(); }
    }
}

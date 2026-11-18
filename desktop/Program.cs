using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
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
        static void Main(string[] args)
        {
            using var single = new Mutex(true, "DrownedLightDesktop", out bool first);
            if (!first) { MessageBox.Show("Drowned Light is already running. Look for the knight icon by the clock.", "Drowned Light"); return; }
            ApplicationConfiguration.Initialize();
            Application.Run(new TrayApp(Array.Exists(args, a => a == "--startup")));
        }
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

        public TrayApp(bool startup)
        {
            Unpack();
            wallItem = new ToolStripMenuItem("Wallpaper on", null, (s, e) => SetWall(wall == null));
            startItem = new ToolStripMenuItem("Start with Windows", null, (s, e) => SetStartup(!IsStartup()));
            var menu = new ContextMenuStrip();
            menu.Items.Add("Play Drowned Light", null, (s, e) => ShowPlay());
            menu.Items.Add(wallItem);
            menu.Items.Add(startItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Quit", null, (s, e) => Quit());
            menu.Opening += (s, e) => { wallItem.Checked = wall != null; startItem.Checked = IsStartup(); };
            tray = new NotifyIcon { Icon = LoadIcon(), Text = "Drowned Light", ContextMenuStrip = menu, Visible = true };
            tray.DoubleClick += (s, e) => ShowPlay();
            SetWall(true);
            if (!startup) tray.ShowBalloonTip(4000, "Drowned Light", "The knights are fighting behind your desktop icons. Right-click the knight by the clock to play or switch it off.", ToolTipIcon.None);
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
            if (play == null || play.IsDisposed) { play = new PlayForm(); play.FormClosed += (s, e) => play = null; play.Show(); }
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

        void Quit()
        {
            SetWall(false);
            play?.Close();
            tray.Visible = false;
            ExitThread();
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
            Load += async (s, e) => { await Web.Load(view, "index.html"); view.CoreWebView2.AcceleratorKeyPressed += (o, a) => { if (a.VirtualKey == (uint)Keys.F11 && a.KeyEventKind == CoreWebView2KeyEventKind.KeyDown) { a.Handled = true; BeginInvoke(new Action(ToggleFull)); } }; };
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
}

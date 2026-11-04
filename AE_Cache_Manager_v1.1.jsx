/*
    AE Cache Manager v1.1
    Compact dockable ScriptUI panel for After Effects (macOS).

    Install in:
    Adobe After Effects <version>/Scripts/ScriptUI Panels/
    Restart AE, then open Window > AE Cache Manager.

    Important:
    - Purge uses AE's app.purge(PurgeTarget.ALL_CACHES) where supported.
    - Cache size detection is best-effort because AE does not expose a
      consistent public scripting API for active cache folder paths.
*/

(function AECacheManager(thisObj) {
    var REFRESH_MS = 5000;
    var refreshTask = null;
    var ui = {};

    function shellQuote(s) {
        return "'" + String(s).replace(/'/g, "'\\''") + "'";
    }

    function getHome() {
        return Folder("~").fsName;
    }

    function getExistingFolder(path) {
        if (!path) return null;
        try {
            var f = new Folder(path);
            return f.exists ? f : null;
        } catch (e) {
            return null;
        }
    }

    function getFolderSize(folder) {
        if (!folder || !folder.exists) return -1;
        try {
            var command = "/usr/bin/du -sk " + shellQuote(folder.fsName) + " 2>/dev/null";
            var result = system.callSystem(command);
            var match = String(result).match(/^\s*(\d+)/);
            return match ? Number(match[1]) * 1024 : -1;
        } catch (e) {
            return -1;
        }
    }

    function prettySize(bytes) {
        if (bytes < 0) return "Not detected";
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
        return (bytes / 1048576).toFixed(0) + " MB";
    }

    function detectFolder(type) {
        var home = getHome();
        var paths;

        if (type === "disk") {
            paths = [
                home + "/Library/Application Support/Adobe/After Effects/Disk Cache",
                home + "/Library/Caches/Adobe/After Effects",
                home + "/Library/Caches/Adobe/After Effects/" 
            ];
        } else {
            paths = [
                home + "/Library/Application Support/Adobe/Common/Media Cache Files",
                home + "/Library/Application Support/Adobe/Common/Media Cache",
                home + "/Library/Caches/Adobe/Media Cache"
            ];
        }

        for (var i = 0; i < paths.length; i++) {
            var folder = getExistingFolder(paths[i]);
            if (folder) return folder;
        }
        return null;
    }

    function status(message) {
        if (ui.status) {
            ui.status.text = message;
            try { ui.status.parent.layout.layout(true); } catch (e) {}
        }
    }

    function refresh() {
        if (!ui.diskValue || !ui.mediaValue) return;

        try {
            var diskFolder = detectFolder("disk");
            var mediaFolder = detectFolder("media");

            ui.diskValue.text = diskFolder ? prettySize(getFolderSize(diskFolder)) : "Path not detected";
            ui.mediaValue.text = mediaFolder ? prettySize(getFolderSize(mediaFolder)) : "Path not detected";
            ui.updated.text = "Updated: " + (new Date()).toLocaleTimeString();

            if (ui.diskPath) ui.diskPath.text = diskFolder ? diskFolder.fsName : "Disk path not detected";
            if (ui.mediaPath) ui.mediaPath.text = mediaFolder ? mediaFolder.fsName : "Media path not detected";

            try { ui.win.layout.layout(true); } catch (layoutError) {}
        } catch (e) {
            status("Monitor error: " + e.toString());
        }
    }

    function purge() {
        var answer = confirm(
            "Purge all caches using After Effects?\n\n" +
            "AE may need to rebuild previews after this operation."
        );
        if (!answer) return;

        try {
            if (typeof PurgeTarget !== "undefined" &&
                PurgeTarget.ALL_CACHES !== undefined) {
                app.purge(PurgeTarget.ALL_CACHES);
                status("Purge command sent. Refreshing...");
                refresh();
            } else {
                status("ALL_CACHES API unavailable in this AE version.");
                alert("This AE version does not expose PurgeTarget.ALL_CACHES.");
            }
        } catch (e) {
            status("Purge error: " + e.toString());
            alert("Purge failed:\n" + e.toString());
        }
    }

    function stopTimer() {
        if (refreshTask !== null) {
            try { app.cancelTask(refreshTask); } catch (e) {}
            refreshTask = null;
        }
    }

    function startTimer() {
        stopTimer();
        try {
            refreshTask = app.scheduleTask("$.global.AECacheManagerRefreshV11()", REFRESH_MS, true);
        } catch (e) {
            status("Auto-refresh unavailable. Use Refresh.");
        }
    }

    function makeUI(thisObj) {
        var win = (thisObj instanceof Panel) ?
            thisObj : new Window("palette", "AE Cache Manager", undefined, { resizeable: true });

        if (!win) return null;
        ui.win = win;

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 7;
        win.margins = 10;

        var heading = win.add("group");
        heading.orientation = "row";
        heading.alignChildren = ["left", "center"];
        var headingText = heading.add("statictext", undefined, "AE CACHE");
        headingText.characters = 16;
        heading.add("statictext", undefined, "LIVE MONITOR");

        var monitor = win.add("panel", undefined, "CACHE USAGE");
        monitor.orientation = "column";
        monitor.alignChildren = ["fill", "top"];
        monitor.spacing = 7;
        monitor.margins = 9;

        var diskRow = monitor.add("group");
        diskRow.orientation = "row";
        diskRow.alignChildren = ["center", "center"];
        diskRow.add("statictext", undefined, "Disk Cache");
        ui.diskValue = diskRow.add("statictext", undefined, "Scanning...");
        ui.diskValue.alignment = ["right", "center"];

        var mediaRow = monitor.add("group");
        mediaRow.orientation = "row";
        mediaRow.alignChildren = ["center", "center"];
        mediaRow.add("statictext", undefined, "Media Cache");
        ui.mediaValue = mediaRow.add("statictext", undefined, "Scanning...");
        ui.mediaValue.alignment = ["right", "center"];

        var actions = win.add("group");
        actions.orientation = "row";
        actions.alignChildren = ["fill", "center"];
        ui.refreshButton = actions.add("button", undefined, "Refresh");
        ui.purgeButton = actions.add("button", undefined, "PURGE ALL");
        ui.purgeButton.preferredSize = [120, 29];

        ui.status = win.add("statictext", undefined, "Starting monitor...");
        ui.status.characters = 34;
        ui.updated = win.add("statictext", undefined, "Updated: --");
        ui.updated.characters = 34;

        // Optional path details are retained for debugging but hidden by default.
        ui.diskPath = monitor.add("statictext", undefined, "");
        ui.diskPath.visible = false;
        ui.mediaPath = monitor.add("statictext", undefined, "");
        ui.mediaPath.visible = false;

        ui.refreshButton.onClick = refresh;
        ui.purgeButton.onClick = purge;

        win.onResizing = win.onResize = function () {
            try { this.layout.resize(); } catch (e) {}
        };

        win.onClose = function () {
            stopTimer();
            return true;
        };

        try {
            win.layout.layout(true);
            win.layout.resize();
        } catch (e) {}

        return win;
    }

    $.global.AECacheManagerRefreshV11 = function () {
        try { refresh(); } catch (e) {}
    };

    var panel = makeUI(thisObj);
    if (panel && panel instanceof Window) {
        panel.center();
        panel.show();
    }

    refresh();
    startTimer();

})(this);

import QtQuick
import Quickshell
import qs.Commons

Panel {
    FolderListModel { folder: "file:///tmp" }
    property url folderUrl: StandardPaths.writableLocation(StandardPaths.DownloadLocation)
    Component.onCompleted: {
        var x = fetch("http://example.com")
    }
}

import SwiftUI
import Photos

struct ScreenshotsView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        AssetSelectionGridView(
            title: "스크린샷",
            loadAssets: {
                let fetchResult = appState.photoLibraryService.fetchImageAssets()
                let assets = fetchResult.objects(at: IndexSet(0..<fetchResult.count))
                return assets
                    .filter { $0.mediaSubtypes.contains(.photoScreenshot) }
                    .map { PhotoAssetInfo(asset: $0) }
            },
            emptyMessage: "스크린샷이 없어요"
        )
    }
}

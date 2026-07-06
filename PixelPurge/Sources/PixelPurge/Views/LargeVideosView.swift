import SwiftUI
import Photos

struct LargeVideosView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        AssetSelectionGridView(
            title: "동영상",
            loadAssets: {
                let fetchResult = appState.photoLibraryService.fetchVideoAssets()
                let assets = fetchResult.objects(at: IndexSet(0..<fetchResult.count))
                return assets
                    .map { PhotoAssetInfo(asset: $0) }
                    .sorted { $0.asset.duration > $1.asset.duration }
            },
            emptyMessage: "동영상이 없어요"
        )
    }
}

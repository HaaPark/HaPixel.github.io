import SwiftUI

struct ScanProgressOverlay: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(spacing: 16) {
            ProgressView(value: appState.scanProgress)
                .progressViewStyle(.linear)
                .frame(width: 220)
            Text(appState.scanStatusText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

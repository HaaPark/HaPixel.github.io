import SwiftUI
import Photos

struct OnboardingPermissionView: View {
    @EnvironmentObject private var appState: AppState
    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "photo.stack")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            Text("PixelPurge")
                .font(.largeTitle.bold())
            Text("사진을 분석해 중복된 사진과 비슷한 사진, 용량을 많이 차지하는 항목을 찾아 드려요.\n모든 분석은 기기 안에서만 이루어지며, 어떤 사진도 서버로 전송되지 않습니다.")
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 32)
            Spacer()
            Button {
                Task {
                    isRequesting = true
                    await appState.requestAuthorization()
                    if appState.authorizationStatus == .authorized || appState.authorizationStatus == .limited {
                        await appState.loadSummary()
                    }
                    isRequesting = false
                }
            } label: {
                if isRequesting {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("사진 접근 허용하기")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 32)
            .disabled(isRequesting)
            .padding(.bottom, 40)
        }
    }
}

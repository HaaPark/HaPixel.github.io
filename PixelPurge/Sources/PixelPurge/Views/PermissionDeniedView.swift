import SwiftUI
import UIKit

struct PermissionDeniedView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "lock.shield")
                .font(.system(size: 56))
                .foregroundStyle(.secondary)
            Text("사진 접근 권한이 필요해요")
                .font(.title2.bold())
            Text("설정 > PixelPurge 에서 사진 접근을 허용해 주세요.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("설정 열기") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}

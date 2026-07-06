import SwiftUI

struct SettingsView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("정보") {
                    LabeledContent("앱 이름", value: "PixelPurge")
                    LabeledContent("버전", value: "1.0")
                }
                Section {
                    Text("PixelPurge는 기기 안에서만 사진을 분석해요. 어떤 사진이나 데이터도 외부 서버로 전송되거나 저장되지 않습니다.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("개인정보 보호")
                }
                Section {
                    Text("삭제한 사진은 '최근 삭제됨' 앨범으로 이동해 30일간 보관돼요. iCloud 저장 공간을 바로 늘리려면 사진 앱의 '최근 삭제됨'에서도 비워 주세요.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("iCloud 용량 팁")
                }
            }
            .navigationTitle("설정")
        }
    }
}

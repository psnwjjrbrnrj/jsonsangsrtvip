# CapCut JSON to SRT Subtitle Converter 🎬

Công cụ chuyển đổi phụ đề chuyên nghiệp từ file dự án **CapCut PC** và **JianYing Pro** (`draft_content.json`) sang định dạng chuẩn **.SRT**, **.VTT** và **.TXT**.

---

## 🌟 Tính Năng Nổi Bật

- **Giao diện Web trực quan (Glassmorphism & Dark Mode)**:
  - Chạy **100% offline** ngay trên trình duyệt máy tính của bạn, không gửi dữ liệu ra ngoài, bảo mật tuyệt đối.
  - Hỗ trợ kéo & thả file `draft_content.json` (hỗ trợ nạp nhiều file cùng lúc để chuyển đổi hàng loạt).
  - Bảng danh sách phụ đề với mốc thời gian bắt đầu, kết thúc, thời lượng.
  - **Chỉnh sửa trực tiếp**: Có thể bấm vào sửa ngay câu từ hoặc mốc giờ nếu CapCut nhận diện nhầm.
  - **Công cụ dịch thời gian (Time Offset)**: Tăng/giảm toàn bộ thời gian phụ đề (+/- ms) khi video bị lệch nhịp.
  - **Tìm kiếm thông minh**: Lọc và đánh dấu các câu phụ đề theo từ khóa trong nháy mắt.
  - Nút **"Thử file mẫu"**: Trải nghiệm ngay giao diện và tính năng mà không cần chuẩn bị file trước.
  - Xuất ra đa định dạng: **.SRT**, **.VTT**, **.TXT** hoặc sao chép thẳng vào Clipboard.

- **Kèm Script Python tự động hóa (`capcut_to_srt.py`)**:
  - Dành cho bạn nào thích chạy dòng lệnh (CLI).
  - Hỗ trợ quét tự động toàn bộ thư mục chứa hàng chục dự án CapCut và xuất ra SRT hàng loạt.

---

## 🚀 Cách Sử Dụng

### Cách 1: Sử dụng giao diện Web (Khuyên dùng)
1. Nhấp đúp chuột mở file **`index.html`** bằng trình duyệt bất kỳ (Chrome, Edge, Firefox, Cốc Cốc...).
2. Kéo thả file `draft_content.json` vào vùng kéo thả.
3. Xem trước phụ đề trên bảng, chỉnh sửa nếu cần.
4. Bấm **"Tải file .SRT"** để lưu file phụ đề về máy.

---

### Cách 2: Sử dụng Script Python (CLI)

Chuyển đổi 1 file:
```bash
python capcut_to_srt.py draft_content.json
```

Chuyển đổi và xuất cùng lúc cả 3 định dạng (.srt, .vtt, .txt):
```bash
python capcut_to_srt.py draft_content.json -f all
```

Chuyển đổi hàng loạt tất cả các dự án trong thư mục:
```bash
python capcut_to_srt.py "C:\Users\PC\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft"
```

Dịch thời gian phụ đề sớm hoặc trễ (ví dụ trễ 500ms):
```bash
python capcut_to_srt.py draft_content.json --offset 500
```

---

## 📂 Vị Trí Tìm File `draft_content.json` Trên Máy Tính

Mở hộp thoại **Run** (bằng cách ấn tổ hợp phím `Windows + R`), dán đường dẫn tương ứng dưới đây rồi nhấn **Enter**:

- **CapCut PC (Windows)**:
  ```text
  %localappdata%\CapCut\User Data\Projects\com.lveditor.draft\
  ```

- **JianYing Pro (CapCut Trung Quốc)**:
  ```text
  %localappdata%\JianyingPro\User Data\Projects\com.lveditor.draft\
  ```

- **macOS**:
  ```text
  ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/
  ```

> 💡 **Mẹo**: Trong thư mục trên, hãy mở thư mục dự án mà bạn vừa xuất/tạo phụ đề tự động (Auto Captions), bên trong sẽ thấy file `draft_content.json` (hoặc `draft_info.json`). Chỉ cần kéo thả file đó vào tool!

# PROMPT — Nâng cấp bố cục & workflow màn "Soạn" (Lời & nốt) trên điện thoại

**Bối cảnh:** PWA vanilla JS "Assistant Music AI". Màn chính trên điện thoại = bảng "Lời & nốt" (`js/studio.js`, `#studio`, dock `#stDock`), thanh dưới 5 tab (Soạn / Hợp âm / Piano roll / Trợ lý / Cài đặt), piano roll toàn màn hình ngang. Người dùng: nhạc sĩ tự sáng tác tiếng Việt, một tay cầm điện thoại.

**Vấn đề thấy ngay trên ảnh chụp (Android, 390 px):**
- Dock dưới chiếm ~40 % màn hình (5 hàng: thông tin, hợp âm, nốt, độ dài, AI) → chỉ thấy ~2 dòng lời.
- Hàng transport 7 nút to + thanh tên bài chiếm thêm ~25 % phía trên.
- Giọng / BPM / số ô nhịp bị chôn trong Cài đặt dù là thứ chỉnh liên tục khi soạn.
- Workflow rời rạc: không biết "bước kế tiếp" của từng ô là gì (viết lời → gợi ý nốt → hợp âm → nghe); từ ô đang chọn không nhảy sang piano roll được; AI/độ dài/hợp âm dồn chung một chỗ.

## Yêu cầu
1. **Thoáng:** dock chuyển thành 3 tab (🎵 Nốt · 🎶 Hợp âm · ✨ AI), mỗi lúc chỉ hiện đúng nội dung của một tab, có nút thu gọn; chiều cao dock giảm ≥ 40 %. Thu gọn transport + thanh trên; thẻ dòng lời gọn hơn.
2. **Dễ thao tác (một tay):** vùng chạm ≥ 44 px, thao tác chính (chọn nốt, độ dài) ở ngón cái; cuộn ngang không che nút; trạng thái chọn rõ.
3. **Workflow logic:** mỗi ô có **"bước kế tiếp" thông minh** (chưa lời → Viết lời; có lời thiếu nốt → Gợi ý nốt; có nốt thiếu hợp âm → Gợi ý hợp âm; đủ → Dòng tiếp) hiện thành một nút vàng nổi bật; thanh **chip bài hát** (Giọng · Điệu · BPM · số ô) chạm là chỉnh ngay tại chỗ, không phải rời màn Soạn; nút **Mở trong Piano roll** từ chữ đang chọn (cuộn đúng vị trí) và quay lại đúng chữ đó; mọi thay đổi ở tab nào cũng phản ánh đồng bộ ở các tab khác (một nguồn dữ liệu `MS.Store`).
4. **Không phá cái đang chạy:** giữ phím tắt, voice→melody, project mới, undo; trạng thái dock (tab, thu gọn) nhớ qua lần mở sau; máy tính vẫn gọn.
5. **Kiểm thử:** Playwright Pixel 7 + iPhone 13 + desktop: không tràn ngang, không lỗi console, tab dock chuyển đúng, nút "bước kế tiếp" đổi theo trạng thái, chip chỉnh BPM/giọng cập nhật `Store`, mở piano roll đúng vị trí; `tests/logic.test.js` + các e2e cũ vẫn pass.
6. **Phát hành:** changelog, `node tools/bump.js patch`, commit (có trailer), push, `git pull` ở `D:\MusicAi`. Nói rõ phần chưa thử trên máy thật.

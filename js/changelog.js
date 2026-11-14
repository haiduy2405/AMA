/* Lịch sử phiên bản — bản mới nhất ở đầu. Khi phát hành: thêm mục mới lên đầu rồi chạy tools/bump.js */
(function () {
  'use strict';
  const MS = (globalThis.MS = globalThis.MS || {});
  MS.CHANGELOG = [
    {
      v: '0.1.4', date: '14/11/2026', title: 'Bài mới & đoạn hát hiện ở màn chính',
      items: [
        '＋ Bài mới: đặt tên, giọng, nhịp độ, số ô rồi bắt đầu; bài cũ tự lưu vào “Bài gần đây” để mở lại, hoặc chọn xoá hẳn (Ctrl+Z vẫn lấy lại được).',
        'Sau khi hát: tự nghe lại đúng đoạn vừa tạo; “Nghe lại” phát đúng đoạn đó.',
        'Nút “✏️ Chỉnh sửa ở màn chính” đưa đoạn hát ra bảng Lời & nốt và piano roll, đã chọn sẵn các nốt để sửa.',
        'Ô nhịp có nốt nhưng chưa có lời hiện các ô ♪ — chạm để đổi nốt, hợp âm, độ dài như bình thường.',
        'Đã chỉnh tay thì app không tự ghi đè bằng tuỳ chọn căn nhịp/thang âm; “Hát lại” nối tiếp phía sau đoạn cũ.',
        'Điện thoại: thoát piano roll ngang rồi mở bảng Soạn khi bấm “Chỉnh sửa”.',
      ],
    },
    {
      v: '0.1.3', date: '14/11/2026', title: 'Hát để tạo melody & Piano roll Pro',
      items: [
        '🎤 Hát vào micro: bấm nút micro, đếm 4 nhịp, hát một câu — app dò cao độ, tách thành nốt, căn nhịp và đưa vào piano roll. Tự nhận giọng nếu bài còn trống.',
        'Chỉnh ngay sau khi hát: ép vào thang âm, đổi lưới căn nhịp; rồi nghe lại, nhờ AI gợi ý tiếp hoặc viết lời cho melody.',
        'Piano roll Pro: làn Lực nhấn (kéo cột để chỉnh, kéo ngang để vẽ), khoá thang âm, Legato, Chia đôi, Đảo ngược, Ép thang, Tự nhiên hoá, Lặp vùng, Vừa khung, Chọn hết.',
        'Thanh công cụ nâng cao dùng được trên điện thoại (cuộn ngang, nút to dễ chạm).',
      ],
    },
    {
      v: '0.1.2', date: '14/11/2026', title: 'Bảng “Lời & nốt” — không gian sáng tác chính',
      items: [
        'Một màn hình để gõ lời, chọn hợp âm và chọn nốt cho từng chữ hát — chạm là nghe ngay.',
        'AI: “Hoàn thiện câu”, “Làm lại”, “Hợp âm”, “Dòng tiếp” — nốt bám theo dấu thanh tiếng Việt.',
        'Cảnh báo chữ lệch dấu: dấu sắc/ngã mà nốt đi xuống, dấu huyền/nặng mà nốt đi lên sẽ được tô vàng.',
        'Dán nhiều dòng lời một lần (mỗi dòng một ô nhịp); Enter nhảy sang dòng kế.',
        'Máy tính: chia đôi Lời + Piano roll; phím ← → chọn chữ, ↑ ↓ đổi nốt, 1–7 chọn bậc âm.',
        'Popup “Có gì mới” và lịch sử phiên bản.',
        'Sửa: chạm nhanh liên tiếp không còn bị bỏ sót.',
      ],
    },
    {
      v: '0.1.1', date: '14/11/2026', title: 'Chấm điểm motif & nhập nốt trên điện thoại',
      items: [
        'Chấm điểm motif 0–100 kèm 7 tiêu chí và lời khuyên; mỗi phương án AI cũng có điểm, đánh dấu “Hay nhất”.',
        'Đàn ảo trong piano roll ngang: bấm từng nốt, đổi quãng tám, nghỉ, lùi.',
        'Nút ✨ Gợi ý và thanh chọn phương án ngay trong piano roll.',
        'Đánh lại số phiên bản (0.1.x).',
      ],
    },
    {
      v: '0.1.0', date: '14/11/2026', title: 'Bản ứng dụng điện thoại đầu tiên',
      items: [
        'Màn hình chào, cài ra màn hình chính, tự báo cập nhật bản mới.',
        'Piano roll toàn màn hình ngang, cử chỉ 2 ngón để cuộn và zoom.',
        'Sinh melody tiếp từ motif, hợp âm, lời, MIDI keyboard, xuất .mid và bản chép hợp âm.',
      ],
    },
  ];
})();

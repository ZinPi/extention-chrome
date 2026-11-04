CHATGPT TEXT AUTO - LONG PAYLOAD REPEATER V1.0.0
================================================

MỤC TIÊU
- Chạy trên chính tab ChatGPT hiện tại.
- Gửi 1 văn bản ban đầu (tùy chọn).
- Sau đó gửi nguyên văn 1 payload dài lặp lại N lần.
- Mỗi lượt chỉ được gửi sau khi lượt trước đã có response mới và response ổn định.
- Không tự chia nhỏ payload, không tự rút gọn.

CƠ CHẾ AN TOÀN
1) Xác minh payload đã nằm đầy đủ trong composer bằng so sánh chính xác + SHA-256.
2) Gửi bằng nút Send/form; nếu UI mới làm hỏng selector thì có CDP/Chrome Debugger fallback.
3) Sau gửi phải có bằng chứng user message/response đã bắt đầu. Nếu không chắc, dừng để tránh gửi trùng.
4) Chờ assistant response mới, nội dung không còn thay đổi trong khoảng stableSec và không còn trạng thái generating.
5) Chỉ sau đó mới chạy lượt tiếp.
6) Nếu timeout, dừng an toàn; không tự gửi chồng.

CÀI ĐẶT
1) Giải nén ZIP.
2) Chrome -> chrome://extensions
3) Bật Developer mode.
4) Load unpacked -> chọn thư mục ChatGPT_Text_Auto_V1_0.
5) Mở đúng conversation ChatGPT.
6) Bấm icon extension để mở side panel.

Ý NGHĨA SỐ LẦN
- Nếu bật "Gửi văn bản ban đầu" và Repeat = 30:
  TURN 1 = văn bản ban đầu
  TURN 2..31 = payload lặp (30 lần)
- Nếu tắt văn bản ban đầu và Repeat = 30:
  tổng cộng 30 lượt payload lặp.

LƯU Ý
- Tool điều khiển UI ChatGPT, nên OpenAI có thể tiếp tục thay đổi DOM trong tương lai.
- Có ô Composer selector và Send selector để override thủ công nếu cần.
- Nếu thấy SEND_CONFIRM_UNCERTAIN..., tool chủ động dừng để tránh gửi cùng payload hai lần.
- Chrome Debugger fallback có thể làm Chrome hiện thông báo/badge cho biết extension đang debug tab trong lúc thao tác fallback.


V1.0.3 - PROSEMIRROR LOGICAL PASTE VERIFY 2026-09-25
- Đã khóa selector thực tế cho user/assistant/composer/send/generating.
- Sau khi cập nhật extension, phải Ctrl+R tab ChatGPT trước khi chạy.


V1.0.3 PATCH:
- Không dùng innerText thô để xác minh payload nhiều dòng trong ProseMirror.
- Tái dựng logical plaintext từ các block <p>/<div>/<li> và <br>, mỗi block chỉ tạo một newline logic.
- Giữ blank line đúng, bỏ ProseMirror-trailingBreak khỏi phép đếm vì đó là artifact hiển thị.
- Hash vẫn được tính trên toàn bộ logical payload sau khi chuẩn hóa CRLF->LF; không chấp nhận sai chữ hoặc cắt nội dung.
- Khi fail, log cả logical length/hash và raw DOM length/hash để chẩn đoán.


V1.0.4 - BACKGROUND TAB / RESPONSE RECOVERY 2026-09-26
- Stop/Ngừng chỉ được nhận nếu nằm trong composer/form hiện hành.
- Assistant detector hợp nhất search-key + data-conversation-role + markdown node; không bỏ lỡ assistant live chưa có search key.
- Ghép response theo DOM order: assistant xuất hiện sau user vừa gửi.
- Thời gian tab bị ẩn không ăn vào response timeout.
- Khi tab được kích hoạt/reload hoặc service worker sống lại, tự gắn RECOVER_TEXT_TURN nếu lượt đã xác minh SEND nhưng watcher đã mất.
- Recovery không resend lượt đã gửi.

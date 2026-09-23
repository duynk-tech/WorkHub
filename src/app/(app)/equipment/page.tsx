import { redirect } from 'next/navigation';

/**
 * Màn "Thiết bị & Máy móc" đã gộp thành tab "Máy móc" của màn Máy móc & Phụ tùng.
 * Giữ route này để link cũ, bookmark và tem QR in trước đó không chết.
 */
export default function EquipmentPage() {
  redirect('/spare-parts?tab=machines');
}

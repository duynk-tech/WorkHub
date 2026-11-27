import { SpaceLoader } from '@/components/space3d/space-loader';

/** Hiện ngay khi mở /3d trong lúc máy chủ lấy dữ liệu cảnh */
export default function Loading() {
  return <SpaceLoader stage="data" />;
}

import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { can, requireAuth } from '@/server/auth/context';
import { getInventoryProfitReport, resolveRange } from '@/server/modules/spare-parts/report';
import { getCompanyInfo } from '@/server/modules/settings/branding';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const numberFormat = '#,##0;[Red]-#,##0;–';
const moneyFormat = '#,##0 "₫";[Red]-#,##0 "₫";–';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_REPORT_INVENTORY') && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Bạn không có quyền xuất báo cáo kho' }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const rawPreset = params.get('preset');
  const preset = rawPreset === 'QUARTER' || rawPreset === 'YEAR' || rawPreset === 'CUSTOM' ? rawPreset : 'MONTH';
  const anchorValue = params.get('anchor');
  const range = resolveRange(
    preset,
    anchorValue ? new Date(`${anchorValue}T00:00:00`) : new Date(),
    { from: params.get('from') || undefined, to: params.get('to') || undefined },
  );
  const [report, company] = await Promise.all([
    getInventoryProfitReport(range),
    getCompanyInfo(),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = company.name;
  workbook.created = new Date();
  workbook.subject = 'Báo cáo doanh thu thiết bị và phụ tùng';
  workbook.title = `Báo cáo doanh thu - ${report.range.label}`;

  const navy = 'FF1E3A8A';
  const blue = 'FF2563EB';
  const gray = 'FFF1F5F9';
  const border = { style: 'thin' as const, color: { argb: 'FFE2E8F0' } };

  const addReportHeader = (sheet: ExcelJS.Worksheet, columns: number) => {
    sheet.mergeCells(1, 1, 1, columns);
    sheet.getCell(1, 1).value = company.name;
    sheet.getCell(1, 1).font = { bold: true, size: 15, color: { argb: navy } };
    sheet.getCell(1, 1).alignment = { vertical: 'middle' };
    sheet.getRow(1).height = 26;

    const companyLines = [company.address, company.phone && `Điện thoại: ${company.phone}`, company.taxCode && `MST: ${company.taxCode}`]
      .filter(Boolean);
    sheet.mergeCells(2, 1, 2, columns);
    sheet.getCell(2, 1).value = companyLines.join('  ·  ');
    sheet.getCell(2, 1).font = { size: 9, color: { argb: 'FF64748B' } };
    sheet.getRow(2).height = 18;

    sheet.mergeCells(4, 1, 4, columns);
    sheet.getCell(4, 1).value = 'BÁO CÁO DOANH THU THIẾT BỊ & PHỤ TÙNG';
    sheet.getCell(4, 1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(4, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
    sheet.getCell(4, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(4).height = 28;

    sheet.mergeCells(5, 1, 5, columns);
    sheet.getCell(5, 1).value = `Kỳ báo cáo: ${report.range.label}   |   Từ ${report.range.from} đến ${report.range.to}   |   Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`;
    sheet.getCell(5, 1).font = { size: 10, color: { argb: 'FF475569' } };
    sheet.getCell(5, 1).alignment = { horizontal: 'center' };
    sheet.getRow(5).height = 22;
  };

  const styleTableHeader = (row: ExcelJS.Row) => {
    row.height = 30;
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: border, bottom: border, left: border, right: border };
    });
  };

  // First sheet is the transaction ledger users reconcile day to day.
  // Summary and dimension worksheets remain available after the detail.
  const ledger = workbook.addWorksheet('Sổ doanh thu');
  ledger.columns = [
    { header: 'Loại', key: 'kind', width: 14 },
    { header: 'Mã đơn', key: 'orderCode', width: 20 },
    { header: 'Ngày', key: 'orderDate', width: 14 },
    { header: 'Khách hàng', key: 'customerName', width: 34 },
    { header: 'Mã hàng', key: 'itemCode', width: 22 },
    { header: 'Tên hàng', key: 'name', width: 42 },
    { header: 'SL', key: 'quantity', width: 11 },
    { header: 'ĐVT', key: 'unit', width: 10 },
    { header: 'Đơn giá bán', key: 'unitPrice', width: 18 },
    { header: 'Chiết khấu', key: 'discount', width: 18 },
    { header: 'Doanh thu thuần', key: 'revenue', width: 20 },
    { header: 'Tiền hàng vốn', key: 'baseCost', width: 18 },
    { header: 'Phí vận chuyển', key: 'shippingCost', width: 18 },
    { header: 'Phí khác', key: 'otherCost', width: 18 },
    { header: 'Tổng giá vốn', key: 'cogs', width: 18 },
    { header: 'Lợi nhuận gộp', key: 'grossProfit', width: 20 },
    { header: 'Tình trạng giá vốn', key: 'costStatus', width: 22 },
  ];
  addReportHeader(ledger, ledger.columns.length);
  ledger.addRow([]);
  ledger.addRow(ledger.columns.map((column) => column.header));
  styleTableHeader(ledger.getRow(7));
  const ledgerRows = [
    ...(report.salesDetails || []).map((d) => ({
      kind: d.isReturn ? 'Trả hàng · Phụ tùng' : 'Phụ tùng', orderCode: d.orderCode, orderDate: d.orderDate, customerName: d.customerName,
      itemCode: d.itemCode, name: d.name, quantity: d.quantity, unit: d.unit,
      unitPrice: d.unitPrice, discount: d.discount, revenue: d.revenue,
      baseCost: d.breakdownComplete ? d.baseCost : null,
      shippingCost: d.breakdownComplete ? d.shippingCost : null,
      otherCost: d.breakdownComplete ? d.otherCost : null,
      cogs: d.cogs, grossProfit: d.grossProfit,
      costStatus: d.breakdownComplete ? 'Đủ chi tiết' : 'Thiếu tách phí cũ',
    })),
    ...(report.machineSalesDetails || []).map((d) => ({
      kind: d.isReturn ? 'Trả hàng · Thiết bị' : 'Thiết bị', orderCode: d.orderCode, orderDate: d.orderDate, customerName: d.customerName,
      itemCode: d.key, name: d.name, quantity: d.quantity, unit: 'cái',
      unitPrice: d.unitPrice, discount: d.discount, revenue: d.revenue,
      baseCost: null, shippingCost: null, otherCost: null,
      cogs: d.costKnown ? d.cogs : null, grossProfit: d.costKnown ? d.grossProfit : null,
      costStatus: d.costKnown ? 'Đã ghi nhận' : 'Chưa có giá vốn',
    })),
  ].sort((a, b) => b.orderDate.localeCompare(a.orderDate) || a.orderCode.localeCompare(b.orderCode) || a.name.localeCompare(b.name));
  ledgerRows.forEach((data) => {
    const row = ledger.addRow(data);
    row.eachCell((cell, col) => {
      cell.border = { bottom: border };
      if (col === 7) cell.numFmt = numberFormat;
      if (col >= 9 && col <= 16) cell.numFmt = moneyFormat;
      if (col >= 7 && col <= 16) cell.alignment = { horizontal: 'right' };
    });
    if (row.number % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });
  if (ledgerRows.length) {
    const partLedgerRows = ledgerRows.filter((row) => row.kind === 'Phụ tùng');
    const total = ledger.addRow([
      'TỔNG CỘNG', '', '', '', '', `${ledgerRows.length} dòng`,
      ledgerRows.reduce((sum, row) => sum + row.quantity, 0), '', '',
      ledgerRows.reduce((sum, row) => sum + row.discount, 0),
      ledgerRows.reduce((sum, row) => sum + row.revenue, 0),
      partLedgerRows.length && partLedgerRows.every((row) => row.baseCost != null) ? partLedgerRows.reduce((sum, row) => sum + (row.baseCost || 0), 0) : null,
      partLedgerRows.length && partLedgerRows.every((row) => row.shippingCost != null) ? partLedgerRows.reduce((sum, row) => sum + (row.shippingCost || 0), 0) : null,
      partLedgerRows.length && partLedgerRows.every((row) => row.otherCost != null) ? partLedgerRows.reduce((sum, row) => sum + (row.otherCost || 0), 0) : null,
      ledgerRows.every((row) => row.cogs != null) ? ledgerRows.reduce((sum, row) => sum + (row.cogs || 0), 0) : null,
      ledgerRows.every((row) => row.grossProfit != null) ? ledgerRows.reduce((sum, row) => sum + (row.grossProfit || 0), 0) : null,
      ledgerRows.some((row) => row.costStatus !== 'Đủ chi tiết' && row.costStatus !== 'Đã ghi nhận') ? 'Có dòng thiếu dữ liệu' : 'Đầy đủ',
    ]);
    total.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: navy } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      cell.border = { top: border, bottom: border };
    });
  }
  ledger.views = [{ state: 'frozen', xSplit: 6, ySplit: 7 }];
  ledger.autoFilter = { from: 'A7', to: 'Q7' };

  const summary = workbook.addWorksheet('Tổng quan');
  summary.columns = [{ width: 38 }, { width: 24 }, { width: 24 }];
  addReportHeader(summary, 3);
  summary.addRow([]);
  summary.addRow(['CHỈ SỐ', 'GIÁ TRỊ', 'GHI CHÚ']);
  styleTableHeader(summary.getRow(7));
  const summaryRows: [string, number | string, string][] = [
    ['Số đơn bán hàng', report.summary.orderCount, ''],
    ['Doanh thu phụ tùng', report.summary.revenue, 'Đã trừ chiết khấu, chưa VAT'],
    ['Doanh thu máy móc', report.summary.machineRevenue || 0, 'Đã trừ chiết khấu, chưa VAT'],
    ['Doanh thu trước chiết khấu', report.summary.revenue + (report.summary.machineRevenue || 0) + report.summary.discount + (report.summary.machineDiscount || 0), ''],
    ['Tổng doanh thu thuần', report.summary.revenue + (report.summary.machineRevenue || 0), 'Chưa VAT'],
    ['Chiết khấu', report.summary.discount + (report.summary.machineDiscount || 0), ''],
    ['Cước giao hàng thu khách', report.summary.customerShippingFee || 0, 'Hiển thị riêng, chưa cộng vào doanh thu mặt hàng/lợi nhuận'],
    ['VAT thu hộ', report.summary.vatAmount, 'Không tính vào doanh thu/lợi nhuận'],
    ['Tổng giá trị đơn sau điều chỉnh', report.summary.revenue + (report.summary.machineRevenue || 0) + report.summary.vatAmount + (report.summary.customerShippingFee || 0), 'Doanh thu và VAT đã trừ các phiếu trả hàng trong kỳ; không đồng nghĩa số tiền đã thu'],
    ['Giá vốn phụ tùng', report.summary.cogs, ''],
    ['Giá vốn máy móc', report.summary.machineCogs || 0, `${report.summary.machineCostQty || 0}/${report.summary.machineQty || 0} máy có giá vốn`],
    ['Lãi gộp phụ tùng', report.summary.grossProfit, `Tỷ suất ${report.summary.marginPercent}%`],
    ['Chi phí xuất không thu tiền', report.summary.nonSaleCost, ''],
    ['Lợi nhuận đã ghi nhận', report.summary.recognizedProfit ?? report.summary.netProfit, 'Doanh thu thuần − giá vốn − chi phí xuất kho ngoài bán; chưa gồm vận hành/cước giao hàng thực tế nếu chưa hạch toán'],
    ['Hàng bán trả lại', report.summary.returnedAmount, ''],
    ['Phiếu trả chưa đối chiếu', report.summary.unmatchedReturnAmount || 0, `${report.summary.unmatchedReturnCount || 0} phiếu; chưa trừ khỏi doanh thu/lợi nhuận theo mặt hàng`],
    ['Lợi nhuận gộp đã xác định', report.summary.grossProfit + (report.summary.machineRevenue || 0) - (report.summary.machineCogs || 0), `Trước chi phí xuất kho ngoài bán; giá vốn máy ${report.summary.machineCostQty || 0}/${report.summary.machineQty || 0} máy đã xác định`],
    ['Nguyên tắc tính', 'Doanh thu thuần − tổng giá vốn', 'Giá vốn đã gồm cước/phí mua phân bổ; VAT và cước giao hàng thu khách theo dõi riêng.'],
  ];
  summaryRows.forEach((data, index) => {
    const row = summary.addRow(data);
    row.getCell(2).numFmt = typeof data[1] === 'number' && index !== 0 ? moneyFormat : numberFormat;
    row.getCell(2).alignment = { horizontal: 'right' };
    row.eachCell((cell) => { cell.border = { bottom: border }; });
    if (index % 2 === 1) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gray } }; });
  });

  const parts = workbook.addWorksheet('Tổng hợp phụ tùng');
  parts.columns = [
    { header: 'Mã hàng', key: 'itemCode', width: 22 },
    { header: 'Tên hàng', key: 'name', width: 42 },
    { header: 'ĐVT', key: 'unit', width: 12 },
    { header: 'SL nhập', key: 'inQty', width: 12 },
    { header: 'Giá trị nhập', key: 'inValue', width: 18 },
    { header: 'SL bán', key: 'soldQty', width: 12 },
    { header: 'Giá bán', key: 'avgSellPrice', width: 18 },
    { header: 'Chiết khấu', key: 'discount', width: 18 },
    { header: 'Doanh thu thuần', key: 'revenue', width: 18 },
    { header: 'Giá vốn bình quân/đơn vị', key: 'actualUnitCost', width: 24 },
    { header: 'Tiền hàng vốn', key: 'baseCost', width: 18 },
    { header: 'Phí vận chuyển phân bổ', key: 'shippingCost', width: 22 },
    { header: 'Phí khác phân bổ', key: 'otherCost', width: 18 },
    { header: 'Tổng giá vốn', key: 'cogs', width: 18 },
    { header: 'Lợi nhuận gộp', key: 'grossProfit', width: 20 },
    { header: 'Tỷ suất (%)', key: 'marginPercent', width: 14 },
    { header: 'SL xuất khác', key: 'nonSaleQty', width: 14 },
    { header: 'Chi phí xuất khác', key: 'nonSaleCost', width: 20 },
    { header: 'Tồn hiện tại', key: 'closingStock', width: 14 },
  ];
  addReportHeader(parts, parts.columns.length);
  parts.addRow([]);
  parts.addRow(parts.columns.map((column) => column.header));
  styleTableHeader(parts.getRow(7));
  report.items.forEach((item) => {
    const row = parts.addRow({
      ...item,
      baseCost: item.soldQty && item.cogsBreakdownComplete ? item.cogsBaseCost || 0 : null,
      shippingCost: item.soldQty && item.cogsBreakdownComplete ? item.cogsShippingCost || 0 : null,
      otherCost: item.soldQty && item.cogsBreakdownComplete ? item.cogsOtherCost || 0 : null,
    });
    row.eachCell((cell, col) => {
      cell.border = { bottom: border };
      if ([4, 6, 18, 19].includes(col)) cell.numFmt = numberFormat;
      else if ([5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17].includes(col)) cell.numFmt = moneyFormat;
      else if (col === 16) cell.numFmt = '0.00\\%';
      if (col >= 4) cell.alignment = { horizontal: 'right' };
    });
    if (row.number % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });
  parts.views = [{ state: 'frozen', xSplit: 2, ySplit: 7 }];
  parts.autoFilter = { from: 'A7', to: `${parts.getColumn(parts.columns.length).letter}7` };

  const sales = workbook.addWorksheet('Bán hàng theo đơn');
  sales.columns = [
    { header: 'Mã đơn', key: 'orderCode', width: 20 },
    { header: 'Ngày', key: 'orderDate', width: 14 },
    { header: 'Khách hàng', key: 'customerName', width: 36 },
    { header: 'Mã hàng', key: 'itemCode', width: 22 },
    { header: 'Tên hàng', key: 'name', width: 42 },
    { header: 'SL', key: 'quantity', width: 12 },
    { header: 'ĐVT', key: 'unit', width: 12 },
    { header: 'Đơn giá bán', key: 'unitPrice', width: 18 },
    { header: 'Chiết khấu', key: 'discount', width: 18 },
    { header: 'Doanh thu thuần', key: 'revenue', width: 18 },
    { header: 'Tiền hàng vốn', key: 'baseCost', width: 18 },
    { header: 'Phí vận chuyển phân bổ', key: 'shippingCost', width: 22 },
    { header: 'Phí khác phân bổ', key: 'otherCost', width: 18 },
    { header: 'Giá vốn', key: 'cogs', width: 18 },
    { header: 'Lợi nhuận gộp', key: 'grossProfit', width: 20 },
  ];
  addReportHeader(sales, sales.columns.length);
  sales.addRow([]);
  sales.addRow(sales.columns.map((column) => column.header));
  styleTableHeader(sales.getRow(7));
  const salesDetails = report.salesDetails || [];
  salesDetails.forEach((detail) => {
    const row = sales.addRow({
      ...detail,
      baseCost: detail.breakdownComplete ? detail.baseCost : null,
      shippingCost: detail.breakdownComplete ? detail.shippingCost : null,
      otherCost: detail.breakdownComplete ? detail.otherCost : null,
    });
    row.eachCell((cell, col) => {
      cell.border = { bottom: border };
      if (col === 6) cell.numFmt = numberFormat;
      if (col >= 8 && col <= 15) cell.numFmt = moneyFormat;
      if (col >= 6) cell.alignment = { horizontal: 'right' };
    });
    if (row.number % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });
  const partsDetailTotal = sales.addRow([
    'TỔNG CỘNG', '', '', '', '',
    salesDetails.reduce((sum, row) => sum + row.quantity, 0), '',
    salesDetails.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0),
    salesDetails.reduce((sum, row) => sum + row.discount, 0),
    salesDetails.reduce((sum, row) => sum + row.revenue, 0),
    salesDetails.every((row) => row.breakdownComplete) ? salesDetails.reduce((sum, row) => sum + (row.baseCost || 0), 0) : null,
    salesDetails.every((row) => row.breakdownComplete) ? salesDetails.reduce((sum, row) => sum + (row.shippingCost || 0), 0) : null,
    salesDetails.every((row) => row.breakdownComplete) ? salesDetails.reduce((sum, row) => sum + (row.otherCost || 0), 0) : null,
    salesDetails.reduce((sum, row) => sum + row.cogs, 0),
    salesDetails.reduce((sum, row) => sum + row.grossProfit, 0),
  ]);
  partsDetailTotal.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: navy } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    cell.border = { top: border, bottom: border };
    if (col === 6) cell.numFmt = numberFormat;
    if (col >= 8) cell.numFmt = moneyFormat;
  });
  sales.views = [{ state: 'frozen', xSplit: 5, ySplit: 7 }];
  sales.autoFilter = { from: 'A7', to: 'O7' };

  const machines = workbook.addWorksheet('Tổng hợp máy móc');
  machines.columns = [
    { header: 'Mã máy', key: 'key', width: 22 },
    { header: 'Tên máy', key: 'name', width: 48 },
    { header: 'SL bán', key: 'quantity', width: 12 },
    { header: 'Đơn giá bán', key: 'unitPrice', width: 18 },
    { header: 'Chiết khấu', key: 'discount', width: 18 },
    { header: 'Doanh thu thuần', key: 'revenue', width: 18 },
    { header: 'Giá vốn', key: 'cogs', width: 18 },
    { header: 'Lợi nhuận gộp', key: 'grossProfit', width: 20 },
    { header: 'Tình trạng giá vốn', key: 'costKnownLabel', width: 22 },
  ];
  addReportHeader(machines, machines.columns.length);
  machines.addRow([]);
  machines.addRow(machines.columns.map((column) => column.header));
  styleTableHeader(machines.getRow(7));
  (report.machineSales || []).forEach((machine) => {
    const row = machines.addRow({ ...machine, costKnownLabel: machine.costKnown ? 'Đã có giá vốn' : 'Chưa có giá vốn', cogs: machine.costKnown ? machine.cogs : null, grossProfit: machine.costKnown ? machine.grossProfit : null });
    row.eachCell((cell, col) => {
      cell.border = { bottom: border };
      if (col === 3) cell.numFmt = numberFormat;
      if (col >= 4 && col <= 8) cell.numFmt = moneyFormat;
      if (col >= 3 && col <= 8) cell.alignment = { horizontal: 'right' };
    });
    if (row.number % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });
  const machineSummaryCostsComplete = (report.machineSales || []).every((machine) => machine.costKnown);
  const machineSummaryTotal = machines.addRow([
    'TỔNG CỘNG', '',
    (report.machineSales || []).reduce((sum, row) => sum + row.quantity, 0), '',
    (report.machineSales || []).reduce((sum, row) => sum + row.discount, 0),
    (report.machineSales || []).reduce((sum, row) => sum + row.revenue, 0),
    machineSummaryCostsComplete ? (report.machineSales || []).reduce((sum, row) => sum + row.cogs, 0) : null,
    machineSummaryCostsComplete ? (report.machineSales || []).reduce((sum, row) => sum + row.grossProfit, 0) : null,
    machineSummaryCostsComplete ? 'Đủ giá vốn' : 'Có máy thiếu giá vốn',
  ]);
  machineSummaryTotal.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: navy } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    cell.border = { top: border, bottom: border };
    if (col === 3) cell.numFmt = numberFormat;
    if (col >= 5 && col <= 8) cell.numFmt = moneyFormat;
  });
  machines.views = [{ state: 'frozen', xSplit: 2, ySplit: 7 }];
  machines.autoFilter = { from: 'A7', to: 'I7' };

  const machineOrders = workbook.addWorksheet('Máy móc theo đơn');
  machineOrders.columns = [
    { header: 'Mã đơn', key: 'orderCode', width: 20 },
    { header: 'Ngày', key: 'orderDate', width: 14 },
    { header: 'Khách hàng', key: 'customerName', width: 36 },
    { header: 'Mã máy', key: 'key', width: 22 },
    { header: 'Tên máy / model', key: 'name', width: 48 },
    { header: 'SL', key: 'quantity', width: 12 },
    { header: 'Đơn giá bán', key: 'unitPrice', width: 18 },
    { header: 'Chiết khấu', key: 'discount', width: 18 },
    { header: 'Doanh thu thuần', key: 'revenue', width: 18 },
    { header: 'Giá vốn', key: 'cogs', width: 18 },
    { header: 'Lợi nhuận gộp', key: 'grossProfit', width: 20 },
    { header: 'Tình trạng giá vốn', key: 'costKnownLabel', width: 22 },
  ];
  addReportHeader(machineOrders, machineOrders.columns.length);
  machineOrders.addRow([]);
  machineOrders.addRow(machineOrders.columns.map((column) => column.header));
  styleTableHeader(machineOrders.getRow(7));
  (report.machineSalesDetails || []).forEach((machine) => {
    const row = machineOrders.addRow({
      ...machine,
      costKnownLabel: machine.costKnown ? 'Đã có giá vốn' : 'Chưa có giá vốn',
      cogs: machine.costKnown ? machine.cogs : null,
      grossProfit: machine.costKnown ? machine.grossProfit : null,
    });
    row.eachCell((cell, col) => {
      cell.border = { bottom: border };
      if (col === 6) cell.numFmt = numberFormat;
      if (col >= 7 && col <= 11) cell.numFmt = moneyFormat;
      if (col >= 6 && col <= 11) cell.alignment = { horizontal: 'right' };
    });
    if (row.number % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });
  machineOrders.views = [{ state: 'frozen', xSplit: 5, ySplit: 7 }];
  machineOrders.autoFilter = { from: 'A7', to: 'L7' };

  const unmatchedReturns = workbook.addWorksheet('Phiếu trả chưa đối chiếu');
  unmatchedReturns.columns = [
    { header: 'Mã phiếu trả', key: 'returnCode', width: 22 },
    { header: 'Ngày', key: 'returnedAt', width: 16 },
    { header: 'Khách hàng', key: 'customerName', width: 38 },
    { header: 'VAT snapshot', key: 'vatAmount', width: 20 },
    { header: 'Tổng giá trị trả', key: 'amount', width: 22 },
  ];
  addReportHeader(unmatchedReturns, unmatchedReturns.columns.length);
  unmatchedReturns.addRow([]);
  unmatchedReturns.addRow(unmatchedReturns.columns.map((column) => column.header));
  styleTableHeader(unmatchedReturns.getRow(7));
  (report.unmatchedReturns || []).forEach((item) => {
    const row = unmatchedReturns.addRow(item);
    row.eachCell((cell, col) => {
      cell.border = { bottom: border };
      if (col >= 4) cell.numFmt = moneyFormat;
    });
  });
  unmatchedReturns.views = [{ state: 'frozen', xSplit: 1, ySplit: 7 }];
  unmatchedReturns.autoFilter = { from: 'A7', to: 'E7' };

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `bao-cao-doanh-thu-${report.range.from}-den-${report.range.to}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}

'use client';

import React, { createContext, useContext } from 'react';
import type { PrintWatermarkConfig } from '@/server/modules/settings/branding';

const defaultPrintWatermarkConfig: PrintWatermarkConfig = {
  enabled: true,
  logoUrl: null,
  opacity: 0.08,
  companyName: 'Công ty Sunny',
};

const PrintWatermarkContext = createContext<PrintWatermarkConfig>(defaultPrintWatermarkConfig);

export function PrintWatermarkProvider({
  value,
  children,
}: {
  value?: PrintWatermarkConfig | null;
  children: React.ReactNode;
}) {
  const mergedValue: PrintWatermarkConfig = {
    ...defaultPrintWatermarkConfig,
    ...(value || {}),
  };

  return (
    <PrintWatermarkContext.Provider value={mergedValue}>
      {children}
    </PrintWatermarkContext.Provider>
  );
}

export function usePrintWatermark(): PrintWatermarkConfig {
  return useContext(PrintWatermarkContext);
}

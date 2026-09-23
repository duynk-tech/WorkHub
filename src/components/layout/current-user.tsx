'use client';

import { createContext, useContext } from 'react';

export interface CurrentUser {
  fullName: string;
  username: string;
  avatarUrl: string | null;
  departmentName: string | null;
  positionName: string | null;
}

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

/** Thông tin người đang đăng nhập, dùng cho các form/biên bản in ấn ở client component. */
export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext);
}

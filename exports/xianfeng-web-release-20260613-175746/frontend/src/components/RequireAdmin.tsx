import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { admin, adminToken, isLoading } = useSelector((state: RootState) => state.admin);
  const [isInitialCheck, setIsInitialCheck] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      setIsInitialCheck(false);
    }
  }, [isLoading]);

  if (isInitialCheck || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b1020] text-[#e6e9f2]">
        <div className="flex items-center gap-3 text-sm font-bold text-[#98a2b3]">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          加载中
        </div>
      </div>
    );
  }

  if (!adminToken || !admin || admin.role !== 'admin') {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
};

export default RequireAdmin;

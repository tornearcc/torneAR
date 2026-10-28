import React, { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import CustomAlert, { type AlertAction } from '@/components/ui/CustomAlert';
import { GlobalLoader } from '@/components/GlobalLoader';

type AlertConfig = {
  visible: boolean;
  title: string;
  message: string;
  action?: AlertAction;
};

type LoaderConfig = {
  visible: boolean;
  label: string;
};

interface UIContextType {
  showAlert: (title: string, message: string, action?: AlertAction) => void;
  showLoader: (label: string) => void;
  hideLoader: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });
  const [loaderConfig, setLoaderConfig] = useState<LoaderConfig>({
    visible: false,
    label: '',
  });

  const showAlert = (title: string, message: string, action?: AlertAction) => {
    setAlertConfig({ visible: true, title, message, action });
  };

  const hideAlert = () => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  };

  const showLoader = (label: string) => {
    setLoaderConfig({ visible: true, label });
  };

  const hideLoader = () => {
    setLoaderConfig((prev) => ({ ...prev, visible: false }));
  };

  const value = useMemo(
    () => ({ showAlert, showLoader, hideLoader }),
    []
  );

  return (
    <UIContext.Provider value={value}>
      {children}
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={hideAlert}
        action={alertConfig.action}
      />
      {loaderConfig.visible && <GlobalLoader label={loaderConfig.label} />}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);

  if (!context) {
    throw new Error('useUI debe usarse dentro de UIProvider');
  }

  return context;
}

export const getAlertColor = (type: "error" | "info" | "success" | "warning") => {
    switch (type) {
      case "error": return "danger" as const;
      case "info": return "primary" as const;
      case "success": return "success" as const;
      case "warning": return "warning" as const;
      default: return "default" as const;
    }
  };
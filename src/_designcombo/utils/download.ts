export const download = (url: string, filename: string) => {
  fetch(url, { credentials: "include" })
    .then((response) => {
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      return response.blob();
    })
    .then((blob) => {
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
    })
    .catch((error) => console.error("Download error:", error));
};

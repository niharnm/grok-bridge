const copyButton = document.querySelector("[data-copy]");
const copyStatus = document.querySelector(".copy-status");
if (copyButton && copyStatus && navigator.clipboard?.writeText) {
  copyButton.hidden = false;
  copyButton.addEventListener("click", async () => {
    const text = document.getElementById(copyButton.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      copyStatus.textContent = "Installation command copied.";
    } catch {
      copyStatus.textContent =
        "Clipboard access was unavailable. Select and copy the command above.";
    }
  });
}

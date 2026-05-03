const demo = document.querySelector("[data-demo]");
const stage = document.querySelector("[data-demo-stage]");
const selection = document.querySelector("[data-selection]");
const qrTarget = document.querySelector("[data-qr-target]");
const resultStatus = document.querySelector("[data-result-status]");

if (demo && stage && selection && qrTarget && resultStatus) {
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const setSelectionPosition = (left, top) => {
    const stageRect = stage.getBoundingClientRect();
    const selectionRect = selection.getBoundingClientRect();
    const nextLeft = clamp(left, 0, stageRect.width - selectionRect.width);
    const nextTop = clamp(top, 0, stageRect.height - selectionRect.height);

    selection.style.left = `${nextLeft}px`;
    selection.style.top = `${nextTop}px`;
    updateDetectionState();
  };

  const overlapRatio = (a, b) => {
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const overlapArea = x * y;
    const targetArea = b.width * b.height;

    return targetArea === 0 ? 0 : overlapArea / targetArea;
  };

  const updateDetectionState = () => {
    const selectionRect = selection.getBoundingClientRect();
    const targetRect = qrTarget.getBoundingClientRect();
    const isDetected = overlapRatio(selectionRect, targetRect) > 0.58;

    demo.classList.toggle("is-detected", isDetected);
    resultStatus.textContent = isDetected ? "QR code detected" : "Waiting for QR code";
  };

  selection.addEventListener("pointerdown", (event) => {
    const selectionRect = selection.getBoundingClientRect();
    dragOffsetX = event.clientX - selectionRect.left;
    dragOffsetY = event.clientY - selectionRect.top;
    selection.setPointerCapture(event.pointerId);
  });

  selection.addEventListener("pointermove", (event) => {
    if (!selection.hasPointerCapture(event.pointerId)) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    setSelectionPosition(
      event.clientX - stageRect.left - dragOffsetX,
      event.clientY - stageRect.top - dragOffsetY
    );
  });

  selection.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 24 : 8;
    const currentLeft = selection.offsetLeft;
    const currentTop = selection.offsetTop;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSelectionPosition(currentLeft - step, currentTop);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSelectionPosition(currentLeft + step, currentTop);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectionPosition(currentLeft, currentTop - step);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectionPosition(currentLeft, currentTop + step);
    }
  });

  window.addEventListener("resize", updateDetectionState);
  updateDetectionState();
}

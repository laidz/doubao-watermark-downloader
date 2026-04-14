// ==UserScript==
// @name         豆包图片无水印下载
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  豆包生图图片无水印下载 - 通过合并预览图和复制图去除水印
// @author       Laidezhong@gmail.com
// @match        https://www.doubao.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const STYLE_ID = 'doubao-watermark-style';
    const BTN_ID = 'doubao-no-watermark-btn';
    const ADVANCED_BTN_ID = 'doubao-advanced-download-btn';
    const MODAL_ID = 'doubao-advanced-modal';
    const LOADING_ID = 'doubao-loading-tip';

    const WATERMARK_WIDTH = 400;
    const WATERMARK_HEIGHT = 200;

    const SELECTORS = {
        previewAside: 'aside.relative',
        previewAsideCollapsedClass: 'w-0',
        dropdownContent: '.semi-dropdown-content',
        menuItems: '[class^="context-menu-item-"]',
        previewImage: 'img[alt="preview"]',
        toastWrapper: 'div.semi-toast-innerWrapper',
    };

    const TEXTS = {
        copyButton: '复制',
        copySuccess: '复制成功',
        buttonText: '无水印下载',
        buttonTextCopying: '正在复制...',
        buttonTextSuccess: '下载成功',
        advancedButtonText: '高级下载',
        advancedButtonTextProcessing: '处理中...',
        advancedModalTitle: '高级下载设置',
        widthLabel: '宽度 (px)',
        heightLabel: '高度 (px)',
        formatLabel: '格式',
        qualityLabel: '质量',
        maintainRatioLabel: '保持比例',
        cancelText: '取消',
        confirmText: '下载',
    };

    const TIMEOUTS = {
        copySuccess: 20000,
        menuAppear: 100,
        clipboardUpdate: 500,
        buttonReset: 1500,
        observerAutoDisconnect: 5000,
    };

    const ICONS = {
        download: '<span role="img" class="semi-icon semi-icon-default"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M19.207 12.707a1 1 0 0 0-1.414-1.414L13 16.086V2a1 1 0 1 0-2 0v14.086l-4.793-4.793a1 1 0 0 0-1.414 1.414l6.5 6.5c.195.195.45.293.706.293H5a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2h-6.999a1 1 0 0 0 .706-.293z"></path></svg></span>',
        settings: '<span role="img" class="semi-icon semi-icon-default"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"></path></svg></span>',
    };

    let isProcessing = false;
    let menuObserver = null;

    function iconText(icon, text) {
        return icon + text;
    }

    function formatDate() {
        const now = new Date();
        return now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');
    }

    function generateFilename(width, height, format, quality) {
        const dateStr = formatDate();
        const extension = format === 'jpeg' ? 'jpg' : format;
        let filename = `image-${dateStr}-${width}x${height}`;
        if (format === 'jpeg') {
            filename += `-${Math.round(quality * 100)}`;
        }
        return `${filename}.${extension}`;
    }

    function findCopyMenuItem() {
        const dropdownContent = document.querySelector(SELECTORS.dropdownContent);
        if (!dropdownContent) return null;

        const menuItems = dropdownContent.querySelectorAll(SELECTORS.menuItems);
        for (const item of menuItems) {
            if (item.id === BTN_ID || item.id === ADVANCED_BTN_ID) continue;
            if (item.textContent.includes(TEXTS.copyButton)) return item;
        }
        return null;
    }

    function isPreviewPanelVisible() {
        const aside = document.querySelector(SELECTORS.previewAside);
        if (!aside || aside.offsetParent === null) return false;
        if (aside.classList.contains(SELECTORS.previewAsideCollapsedClass)) return false;
        return true;
    }

    function getPreviewImage() {
        return document.querySelector(SELECTORS.previewImage);
    }

    function getPreviewDimensions() {
        const img = getPreviewImage();
        if (!img) return null;
        return {
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            src: img.src,
        };
    }

    function setButtonState(btn, icon, text, disabled) {
        btn.innerHTML = iconText(icon, text);
        btn.style.opacity = disabled ? '0.6' : '1';
    }

    function resetButtonLater(btn, icon, text) {
        setTimeout(() => {
            btn.innerHTML = iconText(icon, text);
            btn.style.opacity = '1';
        }, TIMEOUTS.buttonReset);
    }

    function addStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BTN_ID}, #${ADVANCED_BTN_ID} {
                cursor: pointer;
            }
            #${BTN_ID}:hover, #${ADVANCED_BTN_ID}:hover {
                background-color: rgba(0, 0, 0, 0.04);
            }
            #${MODAL_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            #${MODAL_ID} .modal-content {
                background-color: #fff;
                border-radius: 12px;
                padding: 24px;
                width: 360px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            }
            #${MODAL_ID} .modal-title {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 20px;
                color: #1a1a1a;
            }
            #${MODAL_ID} .form-group {
                margin-bottom: 16px;
            }
            #${MODAL_ID} .form-label {
                display: block;
                font-size: 14px;
                color: #666;
                margin-bottom: 6px;
            }
            #${MODAL_ID} .form-input {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #ddd;
                border-radius: 8px;
                font-size: 14px;
                box-sizing: border-box;
                transition: border-color 0.2s;
            }
            #${MODAL_ID} .form-input:focus {
                outline: none;
                border-color: #007bff;
            }
            #${MODAL_ID} .form-row {
                display: flex;
                gap: 12px;
            }
            #${MODAL_ID} .form-row .form-group {
                flex: 1;
            }
            #${MODAL_ID} .format-options {
                display: flex;
                gap: 16px;
                margin-top: 6px;
            }
            #${MODAL_ID} .format-option {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                font-size: 14px;
            }
            #${MODAL_ID} .format-option input {
                cursor: pointer;
            }
            #${MODAL_ID} .checkbox-group {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 20px;
            }
            #${MODAL_ID} .checkbox-group input {
                cursor: pointer;
            }
            #${MODAL_ID} .checkbox-group label {
                cursor: pointer;
                font-size: 14px;
                color: #666;
            }
            #${MODAL_ID} .modal-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                margin-top: 24px;
            }
            #${MODAL_ID} .btn {
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
                border: none;
                transition: all 0.2s;
            }
            #${MODAL_ID} .btn-cancel {
                background-color: #f0f0f0;
                color: #666;
            }
            #${MODAL_ID} .btn-cancel:hover {
                background-color: #e0e0e0;
            }
            #${MODAL_ID} .btn-confirm {
                background-color: #007bff;
                color: #fff;
            }
            #${MODAL_ID} .btn-confirm:hover {
                background-color: #0056b3;
            }
            #${MODAL_ID} .btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            #${LOADING_ID} {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: rgba(0, 0, 0, 0.8);
                color: #fff;
                padding: 16px 24px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 999999;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                pointer-events: none;
            }
            #${LOADING_ID} .loading-spinner {
                width: 16px;
                height: 16px;
                border: 2px solid #fff;
                border-top-color: transparent;
                border-radius: 50%;
                animation: doubao-spin 1s linear infinite;
            }
            @keyframes doubao-spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    function showLoading(text = '处理中...') {
        hideLoading();
        const loading = document.createElement('div');
        loading.id = LOADING_ID;
        loading.innerHTML = `<div class="loading-spinner"></div><span>${text}</span>`;
        document.body.appendChild(loading);
    }

    function hideLoading() {
        document.getElementById(LOADING_ID)?.remove();
    }

    function handleRightClick(e) {
        const img = e.target.closest('img');
        if (!img) return;

        // 检查图片是否在 aside.relative 节点内
        const asideContainer = img.closest(SELECTORS.previewAside);
        if (!asideContainer) return;

        setTimeout(tryAddButton, TIMEOUTS.menuAppear);
        observeMenuAndAddButton();
    }

    function observeMenuAndAddButton() {
        if (menuObserver) {
            menuObserver.disconnect();
            menuObserver = null;
        }

        menuObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList') continue;
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (node.matches?.(SELECTORS.dropdownContent) ||
                        node.querySelector?.(SELECTORS.dropdownContent)) {
                        tryAddButton();
                        return;
                    }
                }
            }
        });

        menuObserver.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            if (menuObserver) {
                menuObserver.disconnect();
                menuObserver = null;
            }
        }, TIMEOUTS.observerAutoDisconnect);
    }

    function tryAddButton() {
        if (!isPreviewPanelVisible()) return;
        if (document.getElementById(BTN_ID)) return;

        const copyItem = findCopyMenuItem();
        if (!copyItem) return;

        if (menuObserver) {
            menuObserver.disconnect();
            menuObserver = null;
        }

        const btn = document.createElement('div');
        btn.id = BTN_ID;
        btn.className = copyItem.className;
        btn.innerHTML = iconText(ICONS.download, TEXTS.buttonText);
        btn.style.cssText = 'cursor: pointer;';
        btn.addEventListener('click', handleDownload);

        const advancedBtn = document.createElement('div');
        advancedBtn.id = ADVANCED_BTN_ID;
        advancedBtn.className = copyItem.className;
        advancedBtn.innerHTML = iconText(ICONS.settings, TEXTS.advancedButtonText);
        advancedBtn.style.cssText = 'cursor: pointer;';
        advancedBtn.addEventListener('click', handleAdvancedDownload);

        copyItem.before(advancedBtn);
        advancedBtn.before(btn);
    }

    async function autoClickCopyButton() {
        try {
            const copyItem = findCopyMenuItem();
            if (!copyItem) return false;

            copyItem.click();
            copyItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            copyItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            return true;
        } catch (error) {
            console.error('[无水印下载] 自动点击复制按钮出错:', error);
            return false;
        }
    }

    function resetCopySuccessState() {
        const existingToast = document.querySelector(SELECTORS.toastWrapper);
        if (!existingToast || !existingToast.textContent.includes(TEXTS.copySuccess)) return;

        const toastWrapper = existingToast.closest('.semi-toast-wrapper');
        (toastWrapper || existingToast).remove();
    }

    function waitForCopySuccess(timeoutMs) {
        return new Promise((resolve) => {
            let resolved = false;

            const done = (result) => {
                if (resolved) return;
                resolved = true;
                clearInterval(checkInterval);
                clearTimeout(timeoutId);
                observer.disconnect();
                resolve(result);
            };

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type !== 'childList') continue;
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;
                        const text = node.matches?.(SELECTORS.toastWrapper)
                            ? node.textContent
                            : node.querySelector?.(SELECTORS.toastWrapper)?.textContent;
                        if (text?.includes(TEXTS.copySuccess)) {
                            done(true);
                            return;
                        }
                    }
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            const checkInterval = setInterval(() => {
                const toasts = document.querySelectorAll(SELECTORS.toastWrapper);
                for (const t of toasts) {
                    if (t.textContent.includes(TEXTS.copySuccess)) {
                        done(true);
                        return;
                    }
                }
            }, 200);

            const timeoutId = setTimeout(() => done(false), timeoutMs);
        });
    }

    async function fetchClipboardImage() {
        resetCopySuccessState();

        const copySuccess = await autoClickCopyButton();
        if (!copySuccess) {
            hideLoading();
            alert('自动点击复制按钮失败，请手动点击复制后再试');
            return null;
        }

        const copyConfirmed = await waitForCopySuccess(TIMEOUTS.copySuccess);
        if (!copyConfirmed) {
            hideLoading();
            alert('复制超时，请手动点击"复制"按钮后再试');
            return null;
        }

        await new Promise(r => setTimeout(r, TIMEOUTS.clipboardUpdate));

        const clipboardImage = await getClipboardImage();
        if (!clipboardImage) {
            hideLoading();
            alert('获取图片失败，请手动点击复制按钮后再试');
            return null;
        }

        return clipboardImage;
    }

    async function getClipboardImage() {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        return await item.getType(type);
                    }
                }
            }
        } catch (error) {
            console.error('[无水印下载] 剪贴板读取失败:', error);
        }
        return null;
    }

    function loadImageFromBlob(blob) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    function loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => {
                const img2 = new Image();
                img2.crossOrigin = 'use-credentials';
                img2.onload = () => resolve(img2);
                img2.onerror = reject;
                img2.src = url;
            };
            img.src = url;
        });
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function processImage(clipboardBlob, previewSrc, targetWidth, targetHeight, format, quality) {
        const [clipboardImg, previewImg] = await Promise.all([
            loadImageFromBlob(clipboardBlob),
            loadImageFromUrl(previewSrc),
        ]);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const scaleX = targetWidth / previewImg.width;
        const scaleY = targetHeight / previewImg.height;

        ctx.drawImage(previewImg, 0, 0, targetWidth, targetHeight);

        const wmW = Math.min(WATERMARK_WIDTH * scaleX, targetWidth);
        const wmH = Math.min(WATERMARK_HEIGHT * scaleY, targetHeight);

        ctx.globalCompositeOperation = 'destination-out';
        ctx.clearRect(0, 0, wmW, wmH);
        ctx.globalCompositeOperation = 'source-over';

        const clipScaleX = clipboardImg.width / previewImg.width;
        const clipScaleY = clipboardImg.height / previewImg.height;

        ctx.drawImage(
            clipboardImg,
            0, 0, WATERMARK_WIDTH * clipScaleX, WATERMARK_HEIGHT * clipScaleY,
            0, 0, wmW, wmH,
        );

        return new Promise((resolve, reject) => {
            const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
            canvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('图片转换失败')),
                mimeType,
                format === 'jpeg' ? quality : undefined,
            );
        });
    }

    async function handleDownload(e) {
        if (isProcessing) return;
        isProcessing = true;

        const btn = e.currentTarget;
        const originalHTML = btn.innerHTML;
        setButtonState(btn, ICONS.download, TEXTS.buttonTextCopying, true);

        try {
            const dims = getPreviewDimensions();
            if (!dims) {
                alert('未找到预览图，请先点击图片放大预览');
                return;
            }

            showLoading('正在复制图片...');
            const clipboardImage = await fetchClipboardImage();
            if (!clipboardImage) {
                btn.innerHTML = originalHTML;
                return;
            }

            showLoading('正在处理图片...');
            const processedBlob = await processImage(
                clipboardImage, dims.src, dims.width, dims.height, 'png', 1.0,
            );

            hideLoading();
            downloadBlob(processedBlob, generateFilename(dims.width, dims.height, 'png', 1.0));
            setButtonState(btn, ICONS.download, TEXTS.buttonTextSuccess, false);
        } catch (error) {
            hideLoading();
            console.error('[无水印下载] 处理失败:', error);
            alert('处理失败: ' + error.message);
            btn.innerHTML = originalHTML;
        } finally {
            isProcessing = false;
            btn.style.opacity = '1';
            resetButtonLater(btn, ICONS.download, TEXTS.buttonText);
        }
    }

    async function handleAdvancedDownload(e) {
        if (isProcessing) return;
        isProcessing = true;

        const btn = e.currentTarget;
        const originalHTML = btn.innerHTML;
        setButtonState(btn, ICONS.settings, TEXTS.buttonTextCopying, true);

        try {
            const dims = getPreviewDimensions();
            if (!dims) {
                alert('未找到预览图，请先点击图片放大预览');
                return;
            }

            showLoading('正在复制图片...');
            const clipboardImage = await fetchClipboardImage();
            if (!clipboardImage) {
                btn.innerHTML = originalHTML;
                btn.style.opacity = '1';
                isProcessing = false;
                return;
            }

            hideLoading();
            setButtonState(btn, ICONS.settings, TEXTS.advancedButtonText, false);
            isProcessing = false;

            showAdvancedModal(dims.width, dims.height, clipboardImage);
        } catch (error) {
            hideLoading();
            console.error('[高级下载] 复制失败:', error);
            alert('复制失败: ' + error.message);
            btn.innerHTML = originalHTML;
            btn.style.opacity = '1';
            isProcessing = false;
        }
    }

    function showAdvancedModal(originalWidth, originalHeight, clipboardImage) {
        document.getElementById(MODAL_ID)?.remove();

        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-title">${TEXTS.advancedModalTitle}</div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">${TEXTS.widthLabel}</label>
                        <input type="number" class="form-input" id="doubao-advanced-width" placeholder="${originalWidth}" min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${TEXTS.heightLabel}</label>
                        <input type="number" class="form-input" id="doubao-advanced-height" placeholder="${originalHeight}" min="1">
                    </div>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="doubao-maintain-ratio" checked>
                    <label for="doubao-maintain-ratio">${TEXTS.maintainRatioLabel}</label>
                </div>
                <div class="form-group">
                    <label class="form-label">${TEXTS.formatLabel}</label>
                    <div class="format-options">
                        <label class="format-option">
                            <input type="radio" name="doubao-format" value="jpeg" checked>
                            <span>JPG</span>
                        </label>
                        <label class="format-option">
                            <input type="radio" name="doubao-format" value="png">
                            <span>PNG</span>
                        </label>
                    </div>
                </div>
                <div class="form-group" id="doubao-quality-group">
                    <label class="form-label">${TEXTS.qualityLabel} <span id="doubao-quality-value">60%</span></label>
                    <input type="range" class="form-input" id="doubao-quality" min="10" max="100" value="60" style="padding: 0; height: 6px;">
                </div>
                <div class="modal-buttons">
                    <button class="btn btn-cancel" id="doubao-advanced-cancel">${TEXTS.cancelText}</button>
                    <button class="btn btn-confirm" id="doubao-advanced-confirm">${TEXTS.confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const widthInput = document.getElementById('doubao-advanced-width');
        const heightInput = document.getElementById('doubao-advanced-height');
        const maintainRatioCheckbox = document.getElementById('doubao-maintain-ratio');
        const cancelBtn = document.getElementById('doubao-advanced-cancel');
        const confirmBtn = document.getElementById('doubao-advanced-confirm');
        const qualityInput = document.getElementById('doubao-quality');
        const qualityValue = document.getElementById('doubao-quality-value');
        const qualityGroup = document.getElementById('doubao-quality-group');
        const formatRadios = document.querySelectorAll('input[name="doubao-format"]');

        const aspectRatio = originalWidth / originalHeight;

        function autoCalculateDimension(changed, other) {
            if (!maintainRatioCheckbox.checked) return;
            const value = parseInt(changed.value);
            if (value && value > 0) {
                other.value = Math.round(
                    changed === widthInput ? value / aspectRatio : value * aspectRatio,
                );
            }
        }

        widthInput.addEventListener('input', () => autoCalculateDimension(widthInput, heightInput));
        heightInput.addEventListener('input', () => autoCalculateDimension(heightInput, widthInput));
        qualityInput.addEventListener('input', () => {
            qualityValue.textContent = qualityInput.value + '%';
        });
        formatRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                qualityGroup.style.display = radio.value === 'jpeg' && radio.checked ? 'block' : 'none';
            });
        });

        function closeModal() { modal.remove(); }

        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        confirmBtn.addEventListener('click', async () => {
            const width = parseInt(widthInput.value) || originalWidth;
            const height = parseInt(heightInput.value) || originalHeight;
            const format = document.querySelector('input[name="doubao-format"]:checked').value;
            const quality = parseInt(qualityInput.value) / 100;

            confirmBtn.disabled = true;
            confirmBtn.textContent = TEXTS.advancedButtonTextProcessing;
            showLoading('正在处理图片...');

            try {
                isProcessing = true;
                const dims = getPreviewDimensions();
                if (!dims) throw new Error('未找到预览图');

                const processedBlob = await processImage(
                    clipboardImage, dims.src, width, height, format, quality,
                );
                hideLoading();
                downloadBlob(processedBlob, generateFilename(width, height, format, quality));
                closeModal();
            } catch (error) {
                hideLoading();
                console.error('[高级下载] 处理失败:', error);
                alert('处理失败: ' + error.message);
                confirmBtn.disabled = false;
                confirmBtn.textContent = TEXTS.confirmText;
            } finally {
                isProcessing = false;
            }
        });
    }

    function init() {
        addStyles();
        document.addEventListener('contextmenu', handleRightClick, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

package com.econorotas.app;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

public class ImileAccessibilityService extends AccessibilityService {
    private long lastCaptureAt = 0L;
    private long lastScrollAt = 0L;
    private String lastPageSignature = "";

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!ImileCaptureStore.isActive(this)) return;
        if (event == null || event.getPackageName() == null) return;
        if (!ImileCaptureStore.RIDER_PACKAGE.contentEquals(event.getPackageName())) return;

        long now = System.currentTimeMillis();
        if (now - lastCaptureAt < 650) return;
        lastCaptureAt = now;

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        StringBuilder page = new StringBuilder();
        page.append("<page capturedAt=\"").append(now).append("\">\n");
        appendNode(page, root, 0);
        page.append("</page>\n");

        String signature = page.toString().replaceAll("bounds=\"[^\"]*\"", "");
        if (!signature.equals(lastPageSignature)) {
            lastPageSignature = signature;
            ImileCaptureStore.appendPage(this, page.toString());
        }

        if (now - lastScrollAt > 1200) {
            AccessibilityNodeInfo scrollable = findScrollable(root);
            if (scrollable != null && scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) {
                lastScrollAt = now;
            }
        }

        root.recycle();
    }

    @Override
    public void onInterrupt() {}

    private void appendNode(StringBuilder out, AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 30) return;

        CharSequence text = node.getText();
        CharSequence description = node.getContentDescription();
        if ((text != null && text.length() > 0) || (description != null && description.length() > 0)) {
            out.append("<node");
            if (text != null && text.length() > 0) {
                out.append(" text=\"").append(escape(text.toString())).append("\"");
            }
            if (description != null && description.length() > 0) {
                out.append(" content-desc=\"").append(escape(description.toString())).append("\"");
            }
            out.append(" class=\"").append(escape(String.valueOf(node.getClassName()))).append("\"");
            out.append(" />\n");
        }

        for (int index = 0; index < node.getChildCount(); index += 1) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child == null) continue;
            appendNode(out, child, depth + 1);
            child.recycle();
        }
    }

    private AccessibilityNodeInfo findScrollable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isScrollable()) return node;

        for (int index = 0; index < node.getChildCount(); index += 1) {
            AccessibilityNodeInfo child = node.getChild(index);
            AccessibilityNodeInfo result = findScrollable(child);
            if (result != null) return result;
            if (child != null) child.recycle();
        }

        return null;
    }

    private String escape(String value) {
        return value
            .replace("&", "&amp;")
            .replace("\"", "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;");
    }
}

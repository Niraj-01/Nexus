"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import type { OrgType } from "@/lib/schemas";
import type { DocType, DocsByType, UploadedDoc } from "../_lib/types";
import { uploadDocPhoto } from "../_lib/uploadDoc";
import { requiredDocs } from "@/lib/onboarding/requirements";

const LABELS: Record<DocType, string> = {
  PAN: "PAN card",
  "80G": "80G certificate",
  "12A": "12A registration",
  REG_CERT: "Registration Certificate",
  GST: "GST registration",
  CIN: "CIN",
};

type Props = {
  open: boolean;
  onClose(): void;
  type: OrgType | undefined;
  uid: string;
  uploaded: DocsByType;
  onUploaded(doc: UploadedDoc): void;
};

export function DocPicker({ open, onClose, type, uid, uploaded, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busyType, setBusyType] = useState<DocType | null>(null);
  const [pendingType, setPendingType] = useState<DocType | null>(null);
  const docs = requiredDocs(type);

  function pick(docType: DocType) {
    if (busyType) return;
    setPendingType(docType);
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting same file
    if (!file || !pendingType) return;
    const docType = pendingType;
    setPendingType(null);
    setBusyType(docType);
    try {
      const uploaded = await uploadDocPhoto(uid, docType, file);
      onUploaded(uploaded);
      toast.success(`${LABELS[docType]} uploaded.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setBusyType(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="form-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(11,13,16,0.45)",
              zIndex: 40,
            }}
          />
          <motion.div
            className="doc-picker"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            style={{
              position: "fixed",
              left: "50%",
              bottom: 18,
              transform: "translateX(-50%)",
              width: "min(640px, calc(100vw - 24px))",
              zIndex: 50,
            }}
          >
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>Attach a document photo</strong>
                <div className="muted-text">Take a photo or upload an existing one.</div>
              </div>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Done
              </button>
            </div>

            <div className="doc-picker-grid">
              {docs.map((d) => {
                const already = uploaded[d];
                return (
                  <button
                    key={d}
                    type="button"
                    className={already ? "doc-pill is-uploaded" : "doc-pill"}
                    onClick={() => pick(d)}
                    disabled={busyType === d}
                  >
                    <span>
                      {already ? "✓ " : "📷 "}
                      {d}
                    </span>
                    <small>
                      {busyType === d
                        ? "Uploading…"
                        : already
                          ? "Replace photo"
                          : LABELS[d]}
                    </small>
                  </button>
                );
              })}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={onFile}
              style={{ display: "none" }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

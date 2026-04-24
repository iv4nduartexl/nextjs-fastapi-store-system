"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCustomer } from "@/components/actions/customers-action";
import { ArrowLeft, Users } from "lucide-react";

export default function NewCustomerPage() {
  const t = useTranslations("customers");
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit() {
    if (!name.trim()) {
      setErrorMsg("Name is required.");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");

    const result = await createCustomer({
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      id_number: idNumber.trim() || undefined,
      credit_limit: creditLimit
        ? parseFloat(creditLimit.replace(/\D/g, ""))
        : undefined,
      notes: notes.trim() || undefined,
    });

    setSubmitting(false);
    if (result.error) {
      setErrorMsg(result.error);
    } else if (result.data) {
      router.push(`/customers/${result.data.id}`);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
        >
          <ArrowLeft size={15} />
          {t("form.back")}
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Users size={20} className="text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t("form.title")}
            </h1>
            <p className="text-sm text-gray-500">{t("form.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">
            {t("form.name")}
          </label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("form.namePlaceholder")}
            className="h-10"
          />
        </div>

        {/* Phone + ID in a row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">
              {t("form.phone")}
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("form.phonePlaceholder")}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">
              {t("form.idNumber")}
            </label>
            <Input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder={t("form.idNumberPlaceholder")}
              className="h-10 font-mono"
            />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">
            {t("form.email")}
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("form.emailPlaceholder")}
            className="h-10"
          />
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">
            {t("form.address")}
          </label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("form.addressPlaceholder")}
            className="h-10"
          />
        </div>

        {/* Credit limit */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">
            {t("form.creditLimit")}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={creditLimit}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              setCreditLimit(
                raw
                  ? parseInt(raw, 10).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })
                  : "",
              );
            }}
            placeholder={t("form.creditLimitPlaceholder")}
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          />
          <p className="text-xs text-gray-400">
            {t("form.creditLimitPlaceholder")}
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-700">
            {t("form.notes")}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("form.notesPlaceholder")}
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        {errorMsg && (
          <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
            {errorMsg}
          </p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold h-11"
        >
          {submitting ? t("form.submitting") : t("form.submit")}
        </Button>
      </div>
    </div>
  );
}

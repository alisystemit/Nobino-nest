import type { PaymentGateway } from "@/lib/payments/types";

import { SandboxGateway } from "@/lib/payments/gateways/sandbox";
import { ZarinpalGateway } from "@/lib/payments/gateways/zarinpal";
import { MellatGateway } from "@/lib/payments/gateways/mellat";
import { SamanGateway } from "@/lib/payments/gateways/saman";
import { ParsianGateway } from "@/lib/payments/gateways/parsian";
import { PasargadGateway } from "@/lib/payments/gateways/pasargad";
import { AsanPardakhtGateway } from "@/lib/payments/gateways/asanpardakht";
import { IranKishGateway } from "@/lib/payments/gateways/irankish";
import { SadadGateway } from "@/lib/payments/gateways/sadad";
import { MabanGateway } from "@/lib/payments/gateways/maban";
import { CetabGateway } from "@/lib/payments/gateways/cetab";
import { PardakhtNetGateway } from "@/lib/payments/gateways/pardakhtnet";
import { PspGateway } from "@/lib/payments/gateways/psp";
import { NextPayGateway } from "@/lib/payments/gateways/nextpay";
import { VanakGateway } from "@/lib/payments/gateways/vanak";
import { BehPardakhtGateway } from "@/lib/payments/gateways/behpardakht";
import { PayIrGateway } from "@/lib/payments/gateways/payir";
import { ZibalGateway } from "@/lib/payments/gateways/zibal";
import { IdPayGateway } from "@/lib/payments/gateways/idpay";
import { AmanatGateway } from "@/lib/payments/gateways/amanat";

/**
 * ثبت مرکزی همه درگاه‌ها. برای افزودن درگاه جدید:
 * ۱) فایل adapter بسازید  ۲) به این لیست اضافه کنید
 */
export const gatewayRegistry: Record<string, PaymentGateway> = {
  sandbox: new SandboxGateway(),
  zarinpal: new ZarinpalGateway(),
  mellat: new MellatGateway(),
  saman: new SamanGateway(),
  parsian: new ParsianGateway(),
  pasargad: new PasargadGateway(),
  asanpardakht: new AsanPardakhtGateway(),
  irankish: new IranKishGateway(),
  sadad: new SadadGateway(),
  maban: new MabanGateway(),
  cetab: new CetabGateway(),
  pardakhtnet: new PardakhtNetGateway(),
  psp: new PspGateway(),
  nextpay: new NextPayGateway(),
  vanak: new VanakGateway(),
  behpardakht: new BehPardakhtGateway(),
  payir: new PayIrGateway(),
  zibal: new ZibalGateway(),
  idpay: new IdPayGateway(),
  amanat: new AmanatGateway(),
};

export function getGateway(id: string): PaymentGateway {
  const gw = gatewayRegistry[id];
  if (!gw) throw new Error(`درگاه "${id}" یافت نشد`);
  return gw;
}

export function listGateways() {
  return Object.values(gatewayRegistry).map((g) => ({
    id: g.id,
    name: g.name,
    sandbox: g.sandbox,
  }));
}

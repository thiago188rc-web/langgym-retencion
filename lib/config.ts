import type { Config } from "./types";

export const RECUPERACION_TEMPLATE_DEFAULT = `Hola {{nombre}} 👋

Vimos que hace unos días no estás viniendo al gimnasio.

¿Todo bien? ¿Podemos ayudarte en algo?`;

export const COBRO_TEMPLATE_DEFAULT = `Hola {{nombre}} 👋

Te escribimos para recordarte que tu cuota se encuentra vencida.

Cuando quieras podemos ayudarte con la renovación.`;

export const DEFAULT_CONFIG: Config = {
  gymName: "Lang Gym",
  ownerName: "Andrés",
  logoDataUrl: null,
  countryCode: "54",
  mobilePrefix: "9",
  ownerWhatsapp: "",
  diasRiesgo: { nivel1: 7, nivel2: 15, nivel3: 30 },
  porVencerDias: 7,
  templates: {
    recuperacion: RECUPERACION_TEMPLATE_DEFAULT,
    cobro: COBRO_TEMPLATE_DEFAULT,
  },
};

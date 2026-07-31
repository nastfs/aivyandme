import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listWardrobeItems from "./tools/list-wardrobe-items";
import wardrobeStats from "./tools/wardrobe-stats";
import listOutfits from "./tools/list-outfits";
import listPlannedOutfits from "./tools/list-planned-outfits";
import createOutfit from "./tools/create-outfit";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "aivy-me",
  title: "Aivy & Me",
  version: "0.1.0",
  instructions:
    "Tools für den digitalen Kleiderschrank Aivy & Me. Kleidungsstücke und Outfits der angemeldeten Person lesen, Statistiken abrufen, neue Outfits erstellen und die Outfit-Planung einsehen.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listWardrobeItems, wardrobeStats, listOutfits, listPlannedOutfits, createOutfit],
});
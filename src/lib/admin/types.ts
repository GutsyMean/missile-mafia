/** What `admin_catalog()` returns: every recipe in the game, compact. */
export interface AdminCatalog {
  latestRunId: number | null;
  firstRunId: number | null;
  professions: CatalogProfession[];
  recipes: CatalogRecipe[];
}

export interface CatalogProfession {
  id: number;
  slug: string;
  name: string;
  iconFileId: number;
  childSkillLineIds: number[];
}

export type LearnStatus = "confirmed" | "single_source" | "disputed" | "unconfirmed" | "owner";

export interface CatalogRecipe {
  id: number;
  professionId: number;
  name: string;
  iconFileId: number;
  quality: number;
  tradeable: boolean;
  requiredLevel: number;
  slotName: string | null;
  typeName: string | null;
  category: string;
  categoryOrder: number;
  /** The unlock level, when it is settled. Null when unknown or disputed. */
  learnSkill: number | null;
  learnStatus: LearnStatus;
  learnCandidates: { wowForever?: number | null; wiki?: number | null; recipeItem?: number | null };
  /** "trainer", "starter", "vendor", "drop", "quest", "unknown" or a combination. */
  acquisition: string;
  acquisitionText: string | null;
  trainingCost: number | null;
  skillYellow: number;
  skillGrey: number;
  firstSeenRunId: number | null;
}

/** What `admin_directory()` returns: who has signed in, and every crafter. Site admins only. */
export interface AdminDirectory {
  /** Newest first. Shown by Discord name; email addresses are never sent. */
  accounts: DirectoryAccount[];
  crafters: DirectoryCrafter[];
}

export interface DirectoryAccount {
  id: string;
  name: string;
  createdAt: string;
  lastSignInAt: string | null;
  isAdmin: boolean;
  /** Discord confirmed this account as a guild member at its last sign-in. */
  isVerifiedMember?: boolean;
}

/** The automatic-approval rule, as `admin_settings()` returns it. Site admins only. */
export interface AdminSettings {
  autoApprove: boolean;
  discordGuildId: string | null;
  discordRoleId: string | null;
  verifiedMembers: number;
}

export interface DirectoryCrafter {
  id: string;
  slug: string;
  characterName: string;
  /** The account that manages this crafter, or null when nobody is linked. */
  userId: string | null;
  isListed: boolean;
  recipeCount: number;
}

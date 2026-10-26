/**
 * Historical rollback target: latest private Master Listing saved before the
 * 26 Oct 2026 Constitution amendments. This restores the ENTIRE workbook
 * exactly (rows, columns, values and listing metadata), not inferred statuses.
 *
 * The caller must use the signed-in user's private Supabase Storage prefix,
 * validate the JSON, back up current.json before writing, and mark the new
 * version to make the rollback idempotent.
 */
export const PRE_AMENDMENT_MASTER_LISTING =
 '20261024015246-1a9063a5-8a51-4ab7-aebe-2e5ce30823d6.json';
export const PRE_AMENDMENT_RESTORE_FIELD='restoredPreAmendment';

export function isMasterListingRestored(model){
 return model?.[PRE_AMENDMENT_RESTORE_FIELD]?.source===PRE_AMENDMENT_MASTER_LISTING;
}

export function restoredMasterListingSnapshot(snapshot){
 // validate shape in caller before this function; clone values and preserve
 // existing snapshot properties, never perform a Constitution normalization.
 return {
  ...snapshot,
  [PRE_AMENDMENT_RESTORE_FIELD]:{
   source:PRE_AMENDMENT_MASTER_LISTING,
   restoredAt:new Date().toISOString()
  }
 };
}

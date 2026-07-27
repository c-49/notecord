import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { listSectionAccess, createSectionAccess, deleteSectionAccess, searchUsers as searchUsersApi } from '@/services/api'

// section_access grants aren't mirrored into the offline Dexie cache (see
// notes/notecord-sharing-feature-prompt.md §6 — offline sync for shared
// content is explicitly out of scope for this pass). This store is a plain
// online-only cache: empty/stale while offline, refreshed on demand.
export const useSharingStore = defineStore('sharing', () => {
  const authStore = useAuthStore()

  // Every section_access row the current user can see — either they're the
  // grantee, or they're the owner of the section it was granted on (see the
  // section_access:read permission in setup-schema.js). There's no signal
  // in the row itself for which case applies; `grantedByMe` below infers it
  // from `granted_by`, which the create-owner-guard Flow only ever lets be
  // the actual section owner.
  const grants = ref([])
  const loaded = ref(false)

  async function loadGrants() {
    if (!navigator.onLine) return
    grants.value = await listSectionAccess()
    loaded.value = true
  }

  function grantedByMe(grant) {
    return grant.granted_by === authStore.user?.id
  }

  // Grants I've given out on a section (whole-section + any page-level
  // overrides within it) — powers both the "shared" badge and the share
  // modal's existing-grants list.
  function grantsGivenForSection(sectionId) {
    return grants.value.filter((g) => g.section_id === sectionId && grantedByMe(g))
  }

  function grantsGivenForPage(pageId) {
    return grants.value.filter((g) => g.page_id === pageId && grantedByMe(g))
  }

  // 'owner' | 'editor' | 'viewer' | null (null = no access, shouldn't occur
  // for anything that made it into the caller's own nav). Conservatively
  // falls back to 'viewer' when grants haven't loaded (offline, or not yet
  // fetched) rather than assuming edit rights on someone else's content.
  function roleFor({ ownerId, sectionId, pageId }) {
    if (ownerId === authStore.user?.id) return 'owner'
    if (!loaded.value) return 'viewer'
    const mine = grants.value.filter((g) => g.user_id === authStore.user?.id || g.user_id?.id === authStore.user?.id)
    const direct = pageId ? mine.find((g) => g.page_id === pageId) : null
    if (direct) return direct.role
    const whole = mine.find((g) => g.section_id === sectionId && g.page_id === null)
    return whole?.role ?? null
  }

  async function shareWhole(sectionId, userId, role) {
    const grant = await createSectionAccess({ section_id: sectionId, page_id: null, user_id: userId, role })
    grants.value.push(grant)
    return grant
  }

  async function sharePages(sectionId, pageIds, userId, role) {
    const created = []
    for (const pageId of pageIds) {
      created.push(await createSectionAccess({ section_id: sectionId, page_id: pageId, user_id: userId, role }))
    }
    grants.value.push(...created)
    return created
  }

  async function revoke(grantId) {
    await deleteSectionAccess(grantId)
    grants.value = grants.value.filter((g) => g.id !== grantId)
  }

  async function searchUsers(query) {
    const results = await searchUsersApi(query)
    // Never offer to share with yourself.
    return results.filter((u) => u.id !== authStore.user?.id)
  }

  return {
    grants,
    loaded,
    loadGrants,
    grantsGivenForSection,
    grantsGivenForPage,
    roleFor,
    shareWhole,
    sharePages,
    revoke,
    searchUsers,
  }
})

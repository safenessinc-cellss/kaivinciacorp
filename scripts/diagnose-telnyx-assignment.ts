import { adminDb } from '../server/_lib/firebaseAdmin.js';

const uid = process.argv.find((arg, index) => index > 1 && !arg.startsWith('-'));
if (!uid) {
  console.error('Uso: npx tsx scripts/diagnose-telnyx-assignment.ts <FIREBASE_UID>');
  process.exit(2);
}

const e164 = (value: unknown): value is string =>
  typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value.trim());

async function main() {
  const [profileSnap, adminAssignmentSnap] = await Promise.all([
    adminDb.collection('users').doc(uid).get(),
    adminDb.collection('telnyx_agent_assignments').doc(uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const adminAssignment = adminAssignmentSnap.data() || {};

  const legacyCredentialId = String(profile.assignedSipCredentialId || '');
  const adminCredentialId = String(adminAssignment.telnyxCredentialId || '');
  const credentialId = legacyCredentialId || adminCredentialId;
  const callerId = String(
    profile.assignedCallerId || adminAssignment.defaultCallerId || ''
  ).trim();
  const authorizedNumbers = Array.isArray(adminAssignment.authorizedNumbers)
    ? adminAssignment.authorizedNumbers.map((value: unknown) => String(value || '').trim())
    : [];

  const [credentialSnap, legacyAssignmentSnap] = credentialId
    ? await Promise.all([
        adminDb.collection('telnyx_sip_credentials').doc(credentialId).get(),
        adminDb.collection('sip_assignments').doc(credentialId).get(),
      ])
    : [null, null];

  const credential = credentialSnap?.data() || {};
  const legacyAssignment = legacyAssignmentSnap?.data() || {};

  // Deliberately report only assignment metadata; never print API keys,
  // SIP passwords, access tokens, or complete credential documents.
  const report = {
    uid,
    profile: {
      exists: profileSnap.exists,
      status: profile.status || null,
      role: profile.role || null,
      hasAssignedSipCredentialId: Boolean(legacyCredentialId),
      assignedSipCredentialId: legacyCredentialId || null,
      assignedCallerId: profile.assignedCallerId || null,
      assignedCallerIdIsE164: e164(profile.assignedCallerId),
    },
    adminHubAssignment: {
      exists: adminAssignmentSnap.exists,
      telnyxCredentialId: adminCredentialId || null,
      defaultCallerId: adminAssignment.defaultCallerId || null,
      authorizedNumbers,
      defaultCallerIdIsAuthorized: Boolean(
        adminAssignment.defaultCallerId &&
        authorizedNumbers.includes(String(adminAssignment.defaultCallerId).trim())
      ),
      authorizedNumbersAreE164: authorizedNumbers.every(e164),
    },
    credential: {
      exists: credentialSnap?.exists || false,
      assignedToMatchesUid: Boolean(credential.assignedTo === uid),
      assignedTo: credential.assignedTo || null,
      active: credential.activo ?? credential.active ?? null,
      connectionId: credential.connectionId || credential.connection_id || null,
      hasTelnyxCredentialReference: Boolean(
        credential.telnyxCredentialId || credential.credentialId || credential.id
      ),
      hasSipUsername: Boolean(
        credential.sip_username || credential.sipUsername || credential.username
      ),
    },
    legacyAssignment: {
      exists: legacyAssignmentSnap?.exists || false,
      assignedToMatchesUid: Boolean(legacyAssignment.assignedTo === uid),
      phoneNumber: legacyAssignment.phoneNumber || null,
    },
    diagnosis: !profileSnap.exists
      ? 'USER_PROFILE_MISSING'
      : !credentialId
        ? 'SIP_CREDENTIAL_NOT_ASSIGNED'
        : !callerId || !e164(callerId)
          ? 'CALLER_ID_MISSING_OR_INVALID'
          : !credentialSnap?.exists
            ? 'CREDENTIAL_DOCUMENT_MISSING'
            : credential.assignedTo !== uid && adminAssignmentSnap.exists
              ? 'CREDENTIAL_NOT_LINKED_TO_USER'
              : adminAssignmentSnap.exists &&
                  (!adminCredentialId || !authorizedNumbers.includes(callerId))
                ? 'ADMIN_HUB_ASSIGNMENT_INCOMPLETE'
                : 'ASSIGNMENT_LOOKS_STRUCTURALLY_VALID; VERIFY TELNYX AUTHORIZATION',
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('Diagnostic failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});

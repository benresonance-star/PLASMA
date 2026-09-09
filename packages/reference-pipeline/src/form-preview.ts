import type { GeometryCompileOp } from '@spds/geometry-contracts';
import type { PreviewLowerer } from '@spds/preview-compiler';
import type { Vec3 } from '@spds/topology-operators';

export const PROFILE_REVOLVE_PREVIEW_CAPABILITY = 'preview.profile-revolve';
export const PROFILE_LOFT_PREVIEW_CAPABILITY = 'preview.profile-loft';

export interface ProfileRevolvePreviewPart {
  readonly id: string;
  readonly profile: readonly Vec3[];
  readonly axisOrigin: Vec3;
  readonly axisDirection: Vec3;
  readonly angleDeg: number;
  readonly segments?: number;
  readonly featurePath?: string;
  readonly visibility?: 'display' | 'construction';
}

export interface ProfileRevolvePreviewOutput {
  readonly parts: readonly ProfileRevolvePreviewPart[];
}

export interface ProfileLoftPreviewPart {
  readonly id: string;
  readonly profiles: readonly (readonly Vec3[])[];
  readonly ruled?: boolean;
  readonly featurePath?: string;
  readonly visibility?: 'display' | 'construction';
}

export interface ProfileLoftPreviewOutput {
  readonly parts: readonly ProfileLoftPreviewPart[];
}

function mutableVec3(value: Vec3): [number, number, number] {
  return [value[0], value[1], value[2]];
}

export function createProfileRevolvePreviewLowerer(): PreviewLowerer {
  return {
    capability: PROFILE_REVOLVE_PREVIEW_CAPABILITY,
    lower: ({ operation, output }): readonly GeometryCompileOp[] => {
      const parts = (output as Partial<ProfileRevolvePreviewOutput> | undefined)
        ?.parts;
      if (!Array.isArray(parts)) {
        throw new Error(`${operation.id} did not produce profile revolve data`);
      }
      const typedParts = parts as readonly ProfileRevolvePreviewPart[];
      return typedParts.map((part) => ({
        op: 'geometry.revolve@1.0.0',
        semanticOwner: part.id,
        pirOperationId: `${operation.id}:${part.id}`,
        profile: part.profile.map(mutableVec3),
        axisOrigin: mutableVec3(part.axisOrigin),
        axisDirection: mutableVec3(part.axisDirection),
        angleDeg: part.angleDeg,
        segments: part.segments ?? 32,
        featurePath: part.featurePath ?? 'profile:revolve',
        ...(part.visibility !== undefined
          ? { visibility: part.visibility }
          : {}),
      }));
    },
  };
}

export function createProfileLoftPreviewLowerer(): PreviewLowerer {
  return {
    capability: PROFILE_LOFT_PREVIEW_CAPABILITY,
    lower: ({ operation, output }): readonly GeometryCompileOp[] => {
      const parts = (output as Partial<ProfileLoftPreviewOutput> | undefined)
        ?.parts;
      if (!Array.isArray(parts)) {
        throw new Error(`${operation.id} did not produce profile loft data`);
      }
      const typedParts = parts as readonly ProfileLoftPreviewPart[];
      return typedParts.map((part) => ({
        op: 'geometry.loft@1.0.0',
        semanticOwner: part.id,
        pirOperationId: `${operation.id}:${part.id}`,
        profiles: part.profiles.map((profile) => profile.map(mutableVec3)),
        ruled: part.ruled ?? true,
        featurePath: part.featurePath ?? 'profile:loft',
        ...(part.visibility !== undefined
          ? { visibility: part.visibility }
          : {}),
      }));
    },
  };
}

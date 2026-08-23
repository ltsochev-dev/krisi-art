import { SlugField as SlugField_2b8867833a34864a02ddf429b0728a40 } from '@payloadcms/next/client'
import { CognitoLogoutButton as CognitoLogoutButton_c1ad7bf6acac9a013ff5734ac1c3a481 } from '@/components/admin/CognitoLogoutButton'
import { CognitoLoginButton as CognitoLoginButton_11b3c5120233c4ecd779c50377d52534 } from '@/components/admin/CognitoLoginButton'
import { S3ClientUploadHandler as S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24 } from '@payloadcms/storage-s3/client'
import { CollectionCards as CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1 } from '@payloadcms/next/rsc'

/** @type import('payload').ImportMap */
export const importMap = {
  "@payloadcms/next/client#SlugField": SlugField_2b8867833a34864a02ddf429b0728a40,
  "@/components/admin/CognitoLogoutButton#CognitoLogoutButton": CognitoLogoutButton_c1ad7bf6acac9a013ff5734ac1c3a481,
  "@/components/admin/CognitoLoginButton#CognitoLoginButton": CognitoLoginButton_11b3c5120233c4ecd779c50377d52534,
  "@payloadcms/storage-s3/client#S3ClientUploadHandler": S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24,
  "@payloadcms/next/rsc#CollectionCards": CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1
}

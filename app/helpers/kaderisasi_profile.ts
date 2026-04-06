enum USER_LEVEL_ENUM {
  JAMAAH,
  AKTIVIS = 3,
  KADER = 6,
  KADER_LANJUT = 10,
}

type KaderisasiPath = {
  ssc?: number | null
  lmd?: number | null
  spectra?: number | null
}

const hasParticipation = (value: number | null | undefined) => value !== undefined

export const getKaderisasiLevel = (path?: KaderisasiPath) => {
  if (hasParticipation(path?.spectra)) {
    return USER_LEVEL_ENUM.KADER_LANJUT
  }

  if (hasParticipation(path?.lmd)) {
    return USER_LEVEL_ENUM.KADER
  }

  if (hasParticipation(path?.ssc)) {
    return USER_LEVEL_ENUM.AKTIVIS
  }

  return USER_LEVEL_ENUM.JAMAAH
}

export const getKaderisasiBadges = (path?: KaderisasiPath) => {
  const badges: string[] = []

  if (hasParticipation(path?.ssc)) {
    badges.push(path?.ssc ? `SSC-${path.ssc}` : 'SSC')
  }

  if (hasParticipation(path?.lmd)) {
    badges.push(path?.lmd ? `LMD-${path.lmd}` : 'LMD')
  }

  if (hasParticipation(path?.spectra)) {
    badges.push(path?.spectra ? `SPECTRA-${path.spectra}` : 'SPECTRA')
  }

  return badges
}

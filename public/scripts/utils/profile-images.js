function buildProfileSeed(username) {
  return String(username)
    .split('')
    .reduce((total, character) => total + character.charCodeAt(0), 0);
}

function buildAiProfileImage(profile, variant = 'primary') {
  const seedOffset = variant === 'backup' ? 37 : 0;
  const prompt = [
    'female game character portrait',
    'high-detail digital art',
    'cinematic game lighting',
    'waist-up composition',
    'beautiful indian woman character',
    profile.outfit || 'stylish dress',
    profile.palette || 'vibrant colors',
    profile.style || 'fashion portrait',
    'colorful outfit with texture',
    'sharp focus',
    'clean gradient background',
  ].join(', ');

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=640&height=640&seed=${buildProfileSeed(profile.username) + seedOffset}&nologo=true`;
}

function buildProfileFallbackImage(profile) {
  const seed = encodeURIComponent(`${profile.name}-${profile.username}`);
  return `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${seed}&backgroundColor=f7d794,f8a5c2,c7f0da,a5d8ff`;
}

export function createProfiles(rawProfiles) {
  return rawProfiles.map((profile) => {
    return {
      ...profile,
      image: profile.avatar || buildProfileFallbackImage(profile),
      fallbackImage: buildProfileFallbackImage(profile),
      isOnline: Boolean(profile.isOnline),
    };
  });
}
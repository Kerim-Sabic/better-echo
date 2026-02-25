export function formatLoginUserDto(rawUser) {
  if (!rawUser || typeof rawUser !== "object") {
    return null;
  }

  return {
    ...rawUser,
    id: rawUser.id ?? null,
    username: rawUser.username ?? null,
    full_name: rawUser.full_name ?? rawUser.name ?? null,
  };
}

export function formatLoginResponseDto(rawLoginResponse) {
  const rawResponse = rawLoginResponse && typeof rawLoginResponse === "object" ? rawLoginResponse : {};

  return {
    ...rawResponse,
    user: formatLoginUserDto(rawResponse.user),
  };
}

export function formatWebauthnAuthOptionsDto(rawOptionsResponse) {
  const rawResponse = rawOptionsResponse && typeof rawOptionsResponse === "object" ? rawOptionsResponse : {};
  return rawResponse;
}

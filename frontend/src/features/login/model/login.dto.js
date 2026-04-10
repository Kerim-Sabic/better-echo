export function formatAuthResponse(rawUser) {
  return {
    message: rawUser.message,
    user: {
      id: rawUser.user.id ?? null,
      username: rawUser.user.username,
      role: rawUser.user.role,
      fullName: rawUser.user.full_name,
      principalType: rawUser.user.principal_type || "user",
    }
  };
}


export function formatWebauthnAuthOptionsDto(rawOptionsResponse = {}) {
  return rawOptionsResponse;
}

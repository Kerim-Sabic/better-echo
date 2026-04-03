export function formatLoginUser(rawUser) {
  return {
    message: rawUser.message,
    user: {
      id: rawUser.user.id,
      username: rawUser.user.username,
      role: rawUser.user.role,
      fullName: rawUser.user.full_name
    }
  };
}


export function formatWebauthnAuthOptionsDto(rawOptionsResponse = {}) {
  return rawOptionsResponse;
}

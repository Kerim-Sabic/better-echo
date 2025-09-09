import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;

export const loginApi = async (username, password) => {
    const response = await axios.post(
        `${API_URL}/login`,
        { username, password },
        { withCredentials: true} // In order to send cookies
    );
    return response.data;
};

export const logoutApi = async () => {
    const response = await axios.post(
        `${API_URL}/logout`,
        {},
        { withCredentials: true} // Send cookies to delete
    );
    return response.data;
};

export const checkAuthApi = async () => {
    const response = await axios.get(
        `${API_URL}/check-auth`,
        { withCredentials: true} // Send cookies to check for user data
    );
    return response.data
}
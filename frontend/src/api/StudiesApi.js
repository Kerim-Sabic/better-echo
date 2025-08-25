import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;

export const listStudiesApi = async () => {
  const { data } = await axios.get(`${API_URL}/studies`, {
    withCredentials: true,
  });
  return data;
};

export const patchStudyApi = async (id, payload) => {
  const { data } = await axios.patch(`${API_URL}/studies/${id}`, payload, {
    withCredentials: true,
  });
  return data;
};

export const deleteStudyApi = async (id) => {
  const { data } = await axios.delete(`${API_URL}/studies/${id}`, {
    withCredentials: true,
  });
  return data;
};

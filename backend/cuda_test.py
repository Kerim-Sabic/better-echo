import torch, os
print("cuda_available:", torch.cuda.is_available())
print("torch.version.cuda:", torch.version.cuda)
print("device_count:", torch.cuda.device_count())
print("CUDA_VISIBLE_DEVICES:", os.environ.get("CUDA_VISIBLE_DEVICES"))
for i in range(torch.cuda.device_count()):
    print(i, torch.cuda.get_device_name(i))

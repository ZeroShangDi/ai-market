from environment import environment
# Explicit user-invoked local retrieval only; never included in reports or source.
if __name__=='__main__':
    env=environment()
    print('账号：'+env['CONTAINER_ADMIN_USER'])
    print('密码：'+env['CONTAINER_ADMIN_PASSWORD'])

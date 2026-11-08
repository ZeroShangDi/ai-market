"""Real retained management UI and mobile public UI acceptance, not the rejected demo."""
from management_check import main as management
from mobile_check import main as mobile
from shell_check import main as shell
if __name__=='__main__':
    management()
    mobile()
    shell()
